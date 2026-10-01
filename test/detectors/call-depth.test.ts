import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

function forwardChain(steps: number): string {
  const names = Array.from({ length: steps }, (_, index) => String.fromCharCode(97 + index));
  return names
    .map((name, index) => {
      const next = names[index + 1];
      return next ? `function ${name}() { return ${next}(); }\n` : `function ${name}() { return 1; }\n`;
    })
    .join("");
}

function workingChain(steps: number): string {
  const names = Array.from({ length: steps }, (_, index) => String.fromCharCode(97 + index));
  return names
    .map((name, index) => {
      const next = names[index + 1];
      if (!next) return `function ${name}(n: number) { return n; }\n`;
      return `function ${name}(n: number) { if (n > 0) return ${next}(n - 1); return 0; }\n`;
    })
    .join("");
}

describe("call depth", () => {
  it("reports a forwarding chain longer than the default of four", () => {
    const [signal] = ofType(signalsFor(forwardChain(6)), "deep-indirection");
    expect(signal).toMatchObject({
      severity: "medium",
      confidence: 0.45,
      title: "Call chain only forwards",
      clusterId: "indirection:a",
    });
    expect(signal?.evidence[0]).toContain("5 steps");
    expect(signal?.evidence[1]).toContain("only forward");
  });

  it("raises severity when the forwarding chain is two past the setting", () => {
    expect(ofType(signalsFor(forwardChain(7)), "deep-indirection")[0]?.severity).toBe("high");
  });

  it("keeps severity low when each step does its own work", () => {
    const [signal] = ofType(signalsFor(workingChain(6)), "deep-indirection");
    expect(signal?.severity).toBe("low");
    expect(signal?.title).toBe("Local call chain is deep");
    expect(signal?.evidence[1]).toContain("their own logic");
  });

  it("honors a lower configured limit", () => {
    const [signal] = ofType(signalsFor(forwardChain(3), { settings: { maxCallDepth: 1 } }), "deep-indirection");
    expect(signal?.evidence[0]).toContain("The setting allows 1");
  });

  it("stays quiet when the chain is exactly the setting", () => {
    expect(ofType(signalsFor(forwardChain(5)), "deep-indirection")).toEqual([]);
  });
});

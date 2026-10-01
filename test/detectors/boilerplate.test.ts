import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

describe("excessive boilerplate", () => {
  it("reports a file whose structure dominates a tiny amount of behavior", () => {
    const source = `
      interface Logger { log(message: string): void }
      class ConsoleLogger implements Logger { log(message: string) { console.log(message); } }
      class LoggerFactory { create(): Logger { return new ConsoleLogger(); } }
      class LoggingService {
        constructor(private logger: Logger) {}
        log(message: string) { return this.logger.log(message); }
      }
    `;
    const [signal] = ofType(signalsFor(source), "excessive-boilerplate");
    expect(signal).toMatchObject({
      severity: "low",
      confidence: 0.45,
      title: "Structure outweighs behavior",
      clusterId: "boilerplate:sample.ts",
    });
    expect(signal?.evidence[0]).toContain("structural");
    expect(signal?.evidence[0]).not.toMatch(/\bwrong\b/i);
  });

  it("stays quiet when the file contains real branching", () => {
    const source = `
      interface Logger { log(message: string): void }
      class ConsoleLogger implements Logger {
        log(message: string) {
          if (message.length === 0) return;
          if (message.length > 10) return;
          if (message.includes("x")) return;
          if (message.includes("y")) return;
          if (message.includes("z")) return;
          console.log(message);
        }
      }
    `;
    expect(ofType(signalsFor(source), "excessive-boilerplate")).toEqual([]);
  });

  it("stays quiet for a single interface", () => {
    expect(ofType(signalsFor("interface Logger { log(message: string): void }\n"), "excessive-boilerplate")).toEqual([]);
  });
});

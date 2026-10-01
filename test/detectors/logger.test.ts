import { describe, expect, it } from "vitest";
import { analyzeText } from "../../src/analyze";
import { loggerSource } from "../fixtures/logger";
import { signalsFor } from "./helpers";

describe("logger sample", () => {
  it("reports several signals and avoids calling the code bad or generated", () => {
    const signals = signalsFor(loggerSource, { fileName: "logger.ts" });
    expect(signals.map((signal) => signal.type).sort()).toEqual([
      "delegation-only",
      "excessive-boilerplate",
      "single-implementation-interface",
      "single-product-factory",
      "single-use-abstraction",
    ]);

    const text = JSON.stringify(signals);
    expect(text).not.toMatch(/AI-generated/i);
    expect(text).not.toMatch(/bad code/i);
    expect(text).not.toMatch(/\bwrong\b/i);

    const factory = signals.find((signal) => signal.type === "single-product-factory");
    const singleUse = signals.find((signal) => signal.type === "single-use-abstraction");
    const iface = signals.find((signal) => signal.type === "single-implementation-interface");
    expect(factory?.clusterId).toBe("abstraction:Logger");
    expect(singleUse?.clusterId).toBe("abstraction:Logger");
    expect(iface?.clusterId).toBe("abstraction:Logger");
    expect(signals.find((signal) => signal.type === "delegation-only")?.evidence[0]).toContain("LoggingService.log");
  });

  it("returns the same signals from analyzeText", () => {
    const result = analyzeText({
      uri: "file:///logger-signals.ts",
      version: 1,
      fileName: "logger.ts",
      languageId: "typescript",
      text: loggerSource,
      scope: "file",
      start: 0,
      end: loggerSource.length,
      position: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.signals.map((signal) => signal.type).sort()).toEqual([
      "delegation-only",
      "excessive-boilerplate",
      "single-implementation-interface",
      "single-product-factory",
      "single-use-abstraction",
    ]);
  });

  it("ignores generated files", () => {
    expect(signalsFor(loggerSource, { fileName: "logger.generated.ts" })).toEqual([]);
  });

  it("caps confidence again for a selection-sized scope", () => {
    const [signal] = signalsFor(loggerSource, { scope: "selection" }).filter(
      (item) => item.type === "single-implementation-interface",
    );
    expect(signal?.confidence).toBe(0.4);
  });
});
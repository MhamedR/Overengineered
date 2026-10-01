import { describe, expect, it } from "vitest";
import { analyzeText } from "../src/analyze";
import { detectSignals } from "../src/detectors";
import { defaultAnalysisSettings } from "../src/detectors/support";
import { extractFacts } from "../src/parse/extract";
import { buildProjectContext, MAX_PROJECT_FILE_CHARACTERS, MAX_PROJECT_MILLISECONDS } from "../src/projectContext";
import type { SignalType } from "../src/types";
import { loggerSource } from "./fixtures/logger";

const loggerFacts = extractFacts(loggerSource, "logger.ts", "typescript");

function signalTypes(files: { fileName: string; text: string }[], options?: { maxFiles?: number; now?: () => number; incomplete?: boolean }): SignalType[] {
  const context = buildProjectContext(loggerFacts, files, options);
  return detectSignals({
    facts: loggerFacts,
    context,
    settings: defaultAnalysisSettings,
    scope: "file",
  }).map((signal) => signal.type);
}

describe("project context", () => {
  it("drops the single-implementation signal when another file implements the interface", () => {
    const types = signalTypes([
      { fileName: "logger.ts", text: loggerSource },
      { fileName: "mock.ts", text: "class MockLogger implements Logger { log(message: string) {} }\n" },
    ]);
    expect(types).not.toContain("single-implementation-interface");
  });

  it("counts a test double in a test file as another implementation", () => {
    const types = signalTypes([
      { fileName: "logger.ts", text: loggerSource },
      { fileName: "logger.test.ts", text: "class MockLogger implements Logger { log(message: string) {} }\n" },
    ]);
    expect(types).not.toContain("single-implementation-interface");
  });

  it("ignores an implementation that appears only in a comment", () => {
    const context = buildProjectContext(loggerFacts, [
      { fileName: "logger.ts", text: loggerSource },
      { fileName: "notes.ts", text: "// class Fake implements Logger\nexport const note = 1;\n" },
    ]);
    expect(context.partial).toBe(false);
    expect(context.externalImplementers?.get("Logger") ?? []).toEqual([]);
    const types = detectSignals({
      facts: loggerFacts,
      context,
      settings: defaultAnalysisSettings,
      scope: "file",
    }).map((signal) => signal.type);
    expect(types).toContain("single-implementation-interface");
    const signal = detectSignals({
      facts: loggerFacts,
      context,
      settings: defaultAnalysisSettings,
      scope: "file",
    }).find((item) => item.type === "single-implementation-interface");
    expect(signal?.confidence).toBe(0.75);
    expect(signal?.evidence[0]).toContain("in the project");
  });

  it("drops a single-use signal when another file references the class", () => {
    const source = "class OnlyOnce {}\nconst value = new OnlyOnce();\n";
    const facts = extractFacts(source, "once.ts", "typescript");
    const context = buildProjectContext(facts, [
      { fileName: "once.ts", text: source },
      { fileName: "caller.ts", text: "const again = new OnlyOnce();\n" },
    ]);
    const signals = detectSignals({ facts, context, settings: defaultAnalysisSettings, scope: "file" });
    expect(signals.filter((signal) => signal.type === "single-use-abstraction")).toEqual([]);
  });

  it("keeps a single-use signal when the project search finds no other reference", () => {
    const source = "class OnlyOnce {}\nconst value = new OnlyOnce();\n";
    const result = analyzeText({
      uri: "file:///once.ts",
      version: 1,
      fileName: "once.ts",
      languageId: "typescript",
      text: source,
      scope: "file",
      start: 0,
      end: source.length,
      position: 0,
      projectFiles: [
        { fileName: "once.ts", text: source },
        { fileName: "other.ts", text: "export const untouched = 1;\n" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.contextPartial).toBe(false);
    expect(result.snapshot.signals.some((signal) => signal.type === "single-use-abstraction" && signal.confidence === 0.75)).toBe(true);
  });

  it("sees a second implementation elsewhere in the same file when the selection does not", () => {
    const source = `interface Logger {
  log(message: string): void;
}
class ConsoleLogger implements Logger {
  log(message: string) { console.log(message); }
}
class MockLogger implements Logger {
  log() {}
}
`;
    const end = source.indexOf("class MockLogger");
    const hidden = analyzeText({
      uri: "file:///same.ts",
      version: 1,
      fileName: "same.ts",
      languageId: "typescript",
      text: source,
      scope: "selection",
      start: 0,
      end,
      position: 0,
    });
    const searched = analyzeText({
      uri: "file:///same-searched.ts",
      version: 1,
      fileName: "same.ts",
      languageId: "typescript",
      text: source,
      scope: "selection",
      start: 0,
      end,
      position: 0,
      projectFiles: [{ fileName: "same.ts", text: source }],
    });
    expect(hidden.ok && hidden.snapshot.signals.some((signal) => signal.type === "single-implementation-interface")).toBe(true);
    expect(searched.ok && searched.snapshot.signals.some((signal) => signal.type === "single-implementation-interface")).toBe(false);
  });

  it("stays partial and keeps the signal when the search stops before the other implementation", () => {
    const context = buildProjectContext(
      loggerFacts,
      [
        { fileName: "logger.ts", text: loggerSource },
        { fileName: "mock.ts", text: "class MockLogger implements Logger { log(message: string) {} }\n" },
      ],
      { maxFiles: 1 },
    );
    expect(context.partial).toBe(true);
    expect(context.externalImplementers?.get("Logger") ?? []).toEqual([]);
    const types = detectSignals({
      facts: loggerFacts,
      context,
      settings: defaultAnalysisSettings,
      scope: "file",
    }).map((signal) => signal.type);
    expect(types).toContain("single-implementation-interface");
  });

  it("stops when the time budget is spent", () => {
    let calls = 0;
    const context = buildProjectContext(loggerFacts, [{ fileName: "mock.ts", text: "class MockLogger implements Logger { log(message: string) {} }\n" }], {
      now: () => {
        calls += 1;
        return calls === 1 ? 0 : MAX_PROJECT_MILLISECONDS;
      },
    });
    expect(context.partial).toBe(true);
    expect(context.externalImplementers?.get("Logger") ?? []).toEqual([]);
  });

  it("does not parse an oversized file and keeps the search partial", () => {
    const context = buildProjectContext(loggerFacts, [
      { fileName: "logger.ts", text: loggerSource },
      { fileName: "huge.ts", text: `${"class MockLogger implements Logger { log() {} }\n"}${"x".repeat(MAX_PROJECT_FILE_CHARACTERS)}` },
    ]);
    expect(context.partial).toBe(true);
    expect(context.externalImplementers?.get("Logger") ?? []).toEqual([]);
  });

  it("lowers factory confidence when the product interface has another implementation in the project", () => {
    const source = `interface Payment { charge(): void }
class StripePayment implements Payment { charge() {} }
class PaymentFactory { create() { return new StripePayment(); } }
`;
    const facts = extractFacts(source, "pay.ts", "typescript");
    const context = buildProjectContext(facts, [
      { fileName: "pay.ts", text: source },
      { fileName: "cash.ts", text: "class CashPayment implements Payment { charge() {} }\n" },
    ]);
    const factory = detectSignals({ facts, context, settings: defaultAnalysisSettings, scope: "file" }).find(
      (signal) => signal.type === "single-product-factory",
    );
    expect(factory?.confidence).toBe(0.35);
    expect(factory?.legitimateReasons.join(" ")).toContain("another implementation");
  });
});

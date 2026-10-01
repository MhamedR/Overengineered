import { beforeEach, describe, expect, it } from "vitest";
import { MAX_CACHED_FILES, analyzeText, clearFactsCache, type AnalyzeInput } from "../src/analyze";
import { loggerSource } from "./fixtures/logger";

function input(overrides: Partial<AnalyzeInput> & Pick<AnalyzeInput, "text" | "scope">): AnalyzeInput {
  const text = overrides.text;
  return {
    uri: "file:///logger.ts",
    version: 1,
    fileName: "logger.ts",
    languageId: "typescript",
    start: 0,
    end: text.length,
    position: 0,
    ...overrides,
  };
}

describe("analyzeText", () => {
  beforeEach(() => clearFactsCache());

  it("reuses facts for the same document version", () => {
    const first = analyzeText(input({ text: loggerSource, scope: "file" }));
    const second = analyzeText(input({ text: loggerSource, scope: "file" }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.snapshot.facts).toBe(second.snapshot.facts);
  });

  it("reparses when the text changes", () => {
    const first = analyzeText(input({ text: loggerSource, scope: "file" }));
    const second = analyzeText(input({ text: `${loggerSource}\nexport const extra = 1;\n`, scope: "file" }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.snapshot.facts).not.toBe(second.snapshot.facts);
  });

  it("drops the oldest cached file after the cache limit", () => {
    const first = analyzeText(input({ uri: "file:///0.ts", text: "export const a = 1;\n", scope: "file" }));
    for (let index = 1; index <= MAX_CACHED_FILES; index += 1) {
      analyzeText(input({ uri: `file:///${index}.ts`, text: `export const a = ${index};\n`, scope: "file" }));
    }
    const again = analyzeText(input({ uri: "file:///0.ts", text: "export const a = 1;\n", scope: "file" }));
    expect(first.ok).toBe(true);
    expect(again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(first.snapshot.facts).not.toBe(again.snapshot.facts);
  });

  it("limits a selection to overlapping declarations", () => {
    const start = loggerSource.indexOf("class ConsoleLogger");
    const end = loggerSource.indexOf("class LoggerFactory");
    const result = analyzeText(input({ text: loggerSource, scope: "selection", start, end }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.facts.classes.map((cls) => cls.name)).toEqual(["ConsoleLogger"]);
    expect(result.snapshot.facts.interfaces).toEqual([]);
    expect(result.snapshot.facts.classes[0]?.implements).toEqual([{ name: "Logger", typeArguments: [] }]);
  });

  it("analyzes the function that contains the cursor", () => {
    const position = loggerSource.indexOf("return this.logger.log");
    const result = analyzeText(input({ text: loggerSource, scope: "function", position }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.facts.classes.map((cls) => cls.name)).toEqual(["LoggingService"]);
    expect(result.snapshot.facts.classes[0]?.methods.map((method) => method.name)).toEqual(["log"]);
    expect(result.snapshot.facts.classes[0]?.constructorParameters).toEqual([]);
    expect(result.snapshot.facts.classes[0]?.methods[0]).toMatchObject({
      body: "forward-call",
      callee: "this.logger.log",
    });
  });

  it("asks for a function when the cursor is outside one", () => {
    const position = loggerSource.indexOf("class LoggerFactory");
    expect(analyzeText(input({ text: loggerSource, scope: "function", position }))).toEqual({
      ok: false,
      message: "Place the cursor inside a function or method.",
    });
  });
});

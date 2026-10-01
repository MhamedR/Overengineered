import { describe, expect, it } from "vitest";
import { analyzeMarkup } from "../../src/markup/analyze";
import { renderAnalysis } from "../../src/ui/render";

const page = `<main class="page">
  <div><div><div><h1>Title</h1></div></div></div>
</main>
<style>
#app .header h1 { color: red !important; }
.a { display: flex; align-items: center; gap: 8px; }
.b { display: flex; align-items: center; gap: 8px; }
</style>`;

describe("markup analysis", () => {
  it("scores markup and style signals together and renders the markup charts", () => {
    const result = analyzeMarkup({ fileName: "page.html", languageId: "html", text: page, scope: "file", start: 0, end: page.length });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { snapshot } = result;
    expect(snapshot.kind).toBe("markup");
    expect(snapshot.signals.map((signal) => signal.type).sort()).toEqual(["duplicate-declarations", "selector-specificity", "wrapper-chain"]);
    expect(snapshot.metrics).toMatchObject({
      elements: 5,
      maxDepth: 5,
      bareWrappers: 3,
      longestWrapperChain: 3,
      rules: 3,
      declarations: 7,
      importantDeclarations: 1,
      highestSpecificity: "1,1,1",
      duplicateBlocks: 1,
    });
    expect(snapshot.contextPartial).toBe(false);
    expect(snapshot.score).toBeGreaterThan(0);

    const html = renderAnalysis(snapshot, "page.html");
    expect(html).toContain("Markup and style shape");
    expect(html).toContain('aria-label="3 empty wrappers, 2 other elements"');
    expect(html).toContain('aria-label="Nesting depth: 5, setting 12"');
    expect(html).toContain('aria-label="1 !important declarations, 6 normal declarations"');
    expect(html).toContain("Empty wrapper chain");
    expect(html).toContain("Does a stylesheet or script select these wrappers by position?");
    expect(html).not.toContain("Code shape");
    expect(html).not.toContain("Other files were not fully searched");
    expect(html).not.toMatch(/<script/i);
  });

  it("analyzes a selection and explains that Analyze Function is for code", () => {
    const start = page.indexOf("<style>");
    const selection = analyzeMarkup({ fileName: "page.html", languageId: "html", text: page, scope: "selection", start, end: page.length });
    expect(selection.ok && selection.snapshot.signals.map((signal) => signal.type).sort()).toEqual([
      "duplicate-declarations",
      "selector-specificity",
    ]);
    expect(analyzeMarkup({ fileName: "a.css", languageId: "css", text: "", scope: "function", start: 0, end: 0 })).toEqual({
      ok: false,
      message: "Analyze Function works in TypeScript and JavaScript. Use Analyze File or Analyze Selection here.",
    });
  });

  it("renders an empty stylesheet without charts", () => {
    const result = analyzeMarkup({ fileName: "a.css", languageId: "css", text: "", scope: "file", start: 0, end: 0 });
    if (!result.ok) throw new Error(result.message);
    const html = renderAnalysis(result.snapshot, "a.css");
    expect(html).toContain("No elements or style rules in this scope.");
    expect(html).toContain("No complexity signals in this scope.");
  });
});

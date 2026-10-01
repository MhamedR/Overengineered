import { describe, expect, it } from "vitest";
import { markupSignals, ofType } from "./helpers";

function nested(levels: number, tag = "section"): string {
  return `${`<${tag} class="level">`.repeat(levels - 1)}<p>deep</p>${`</${tag}>`.repeat(levels - 1)}`;
}

describe("deep nesting", () => {
  it("reports markup deeper than the setting", () => {
    const signals = ofType(markupSignals(nested(5), { settings: { maxNestingDepth: 4 } }), "deep-nesting");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ severity: "low", title: "Markup is nested deeply" });
    expect(signals[0]?.evidence).toEqual(["The deepest element, p, sits 5 levels deep. The setting allows 4."]);
  });

  it("raises severity and confidence when empty wrappers add to the depth", () => {
    const source = `<main class="m">${"<div>".repeat(8)}<p>deep</p>${"</div>".repeat(8)}</main>`;
    const [signal] = ofType(markupSignals(source, { settings: { maxNestingDepth: 5 } }), "deep-nesting");
    expect(signal).toMatchObject({ severity: "medium", confidence: 0.65 });
    expect(signal?.evidence[1]).toBe("8 of the 9 elements above it are div or span elements with no attributes or text of their own.");
  });

  it("stays quiet at the setting, and ignores html, body, and svg internals", () => {
    expect(ofType(markupSignals(nested(12)), "deep-nesting")).toEqual([]);
    const page = `<html><body><main class="m"><svg><g><g><g><g><path d="M0"/></g></g></g></g></svg></main></body></html>`;
    expect(ofType(markupSignals(page, { settings: { maxNestingDepth: 2 } }), "deep-nesting")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { markupSignals, ofType } from "./helpers";

const block = "display: flex; align-items: center; gap: 8px;";

describe("repeated declaration blocks", () => {
  it("reports rules that repeat the same declarations in any order", () => {
    const css = `.toolbar { ${block} }\n.footer-links { gap: 8px; display: flex; align-items: center; }\n.unrelated { color: red; }`;
    const signals = ofType(markupSignals(css, { fileName: "site.css" }), "duplicate-declarations");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ severity: "low", title: "Rules repeat the same declarations" });
    expect(signals[0]?.evidence).toEqual([
      "2 rules repeat the same 3 declarations: .toolbar; .footer-links.",
      "They sit at the same level, outside any at-rule.",
    ]);
  });

  it("raises severity for three or more copies and reports the shared context", () => {
    const css = `@media (min-width: 40em) { .a { ${block} } .b { ${block} } .c { ${block} } }`;
    const [signal] = ofType(markupSignals(css, { fileName: "site.css" }), "duplicate-declarations");
    expect(signal?.severity).toBe("medium");
    expect(signal?.evidence[1]).toBe("They share the same context: @media (min-width: 40em).");
  });

  it("reports duplicates inside an HTML style block", () => {
    const html = `<html><head><style>.a { ${block} } .b { ${block} }</style></head><body><p>x</p></body></html>`;
    expect(ofType(markupSignals(html), "duplicate-declarations")).toHaveLength(1);
  });

  it("stays quiet for short blocks, different values, and copies in different at-rules", () => {
    const quiet = [
      `.a { display: flex; gap: 8px; }\n.b { display: flex; gap: 8px; }`,
      `.a { ${block} }\n.b { display: flex; align-items: center; gap: 12px; }`,
      `.a { ${block} }\n@media print { .a { ${block} } }`,
    ];
    for (const source of quiet) expect(ofType(markupSignals(source, { fileName: "site.css" }), "duplicate-declarations")).toEqual([]);
  });
});

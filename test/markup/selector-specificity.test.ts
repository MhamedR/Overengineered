import { describe, expect, it } from "vitest";
import { markupSignals, ofType } from "./helpers";

describe("over-specific selectors", () => {
  it("reports long chains and id-qualified selectors in one signal", () => {
    const css = `
body .page .content .card .title { color: red; }
#app .header h1 { margin: 0; }
#nav #menu { padding: 0; }
.button { color: blue; }`;
    const signals = ofType(markupSignals(css, { fileName: "site.css" }), "selector-specificity");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ severity: "medium", title: "Selectors are long or highly specific" });
    expect(signals[0]?.evidence[0]).toBe(
      "3 selectors have five or more parts, or use an id together with other parts. The longest has 5 parts.",
    );
    expect(signals[0]?.evidence[1]).toBe("body .page .content .card .title has 5 parts and specificity 0,4,1.");
    expect(signals[0]?.locations.map((location) => location.name)).toEqual([
      "body .page .content .card .title",
      "#app .header h1",
      "#nav #menu",
    ]);
  });

  it("measures selectors produced by SCSS nesting and notes the nesting", () => {
    const scss = `.layout { .main { .panel { .list { .item { color: red; } } } } }`;
    const [signal] = ofType(markupSignals(scss, { fileName: "site.scss" }), "selector-specificity");
    expect(signal?.severity).toBe("low");
    expect(signal?.evidence[1]).toBe(".layout .main .panel .list .item has 5 parts and specificity 0,5,0.");
    expect(signal?.legitimateReasons).toContain("Nested SCSS or Less rules can produce long selectors that read simply in the source.");
  });

  it("stays quiet for short selectors, :where(), a single id, and interpolated selectors", () => {
    const css = `.nav .item a { color: red; }\n:where(#app .a .b .c) .d { color: red; }\n#main .title { color: red; }\n.card:hover { color: red; }`;
    expect(ofType(markupSignals(css, { fileName: "site.css" }), "selector-specificity")).toEqual([]);
    const scss = `#{$root} .a .b .c .d { color: red; }`;
    expect(ofType(markupSignals(scss, { fileName: "site.scss" }), "selector-specificity")).toEqual([]);
  });
});

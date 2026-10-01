import { describe, expect, it } from "vitest";
import { markupSignals, ofType } from "./helpers";

function rules(count: number, important: boolean): string {
  return Array.from({ length: count }, (_, index) => `.card-${index} .title { color: red${important ? " !important" : ""}; }`).join("\n");
}

describe("frequent !important", () => {
  it("reports many !important declarations", () => {
    const signals = ofType(markupSignals(rules(5, true) + "\n" + rules(5, false).replaceAll("card-", "box-"), { fileName: "site.css" }), "important-overuse");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ severity: "low", title: "Many declarations use !important" });
    expect(signals[0]?.evidence).toEqual(["5 of 10 declarations use !important (50%)."]);
    expect(signals[0]?.locations).toHaveLength(5);
  });

  it("raises severity when !important is both frequent and a large share", () => {
    const [signal] = ofType(markupSignals(rules(12, true), { fileName: "site.css" }), "important-overuse");
    expect(signal?.severity).toBe("medium");
  });

  it("stays quiet for a few overrides and for single-class utility rules", () => {
    expect(ofType(markupSignals(rules(4, true), { fileName: "site.css" }), "important-overuse")).toEqual([]);
    const utilities = Array.from({ length: 8 }, (_, index) => `.u-hide-${index} { display: none !important; }`).join("\n");
    expect(ofType(markupSignals(utilities + "\n.sr-only { position: absolute !important; clip: rect(0 0 0 0) !important; }", { fileName: "utilities.css" }), "important-overuse")).toEqual([]);
  });

  it("mentions utility rules it left out of the count", () => {
    const source = `${rules(5, true)}\n.u-hide { display: none !important; }`;
    const [signal] = ofType(markupSignals(source, { fileName: "site.css" }), "important-overuse");
    expect(signal?.evidence[1]).toBe("1 more sits in a single-class utility rule and is left out of that count.");
  });
});

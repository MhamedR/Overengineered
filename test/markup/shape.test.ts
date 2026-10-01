import { describe, expect, it } from "vitest";
import { aliasTarget, isOverSpecific, selectorShape } from "../../src/markup/shape";

describe("selector shape", () => {
  it.each([
    ["a", 1, [0, 0, 1]],
    [".card", 1, [0, 1, 0]],
    ["#app .header h1", 3, [1, 1, 1]],
    ["ul > li + li ~ li", 4, [0, 0, 4]],
    ["a:hover::before", 1, [0, 1, 2]],
    ["input[type='text']:focus", 1, [0, 2, 1]],
    [":is(#a, .b) p", 2, [1, 0, 1]],
    [":where(#a .b) p", 2, [0, 0, 1]],
    [":not(.a.b)", 1, [0, 2, 0]],
    ["li:nth-child(2n + 1)", 1, [0, 1, 1]],
    [".md\\:flex", 1, [0, 1, 0]],
    ["*", 1, [0, 0, 0]],
  ])("measures %s", (selector, compounds, specificity) => {
    expect(selectorShape(selector)).toMatchObject({ compounds, specificity });
  });

  it("flags long chains, several ids, and ids combined with other parts", () => {
    expect(isOverSpecific(selectorShape(".a .b .c .d .e"))).toBe(true);
    expect(isOverSpecific(selectorShape("#a #b"))).toBe(true);
    expect(isOverSpecific(selectorShape("#app .header h1"))).toBe(true);
    expect(isOverSpecific(selectorShape("#main .title"))).toBe(false);
    expect(isOverSpecific(selectorShape(".nav .item a"))).toBe(false);
  });

  it("recognizes values that only pass along another variable", () => {
    expect(aliasTarget("var(--brand)")).toBe("--brand");
    expect(aliasTarget(" var( --brand ) ")).toBe("--brand");
    expect(aliasTarget("var(--brand, red)")).toBeUndefined();
    expect(aliasTarget("$brand")).toBe("$brand");
    expect(aliasTarget("$brand !default")).toBeUndefined();
    expect(aliasTarget("@base")).toBe("@base");
    expect(aliasTarget("calc(var(--a) * 2)")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { markupSignals, ofType } from "./helpers";

describe("variable alias chains", () => {
  it("reports custom properties that only point to other custom properties", () => {
    const css = `:root {
  --blue-500: #2563eb;
  --color-primary: var(--blue-500);
  --button-bg: var(--color-primary);
  --cta-bg: var(--button-bg);
}`;
    const signals = ofType(markupSignals(css, { fileName: "tokens.css" }), "variable-chain");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ severity: "medium", title: "Variables only point to other variables" });
    expect(signals[0]?.evidence[0]).toBe(
      "--cta-bg → --button-bg → --color-primary → --blue-500: 3 variables in a row only pass along another variable's value.",
    );
  });

  it("reports SCSS and Less variable chains", () => {
    expect(ofType(markupSignals(`$a: 1px;\n$b: $a;\n$c: $b;`, { fileName: "v.scss" }), "variable-chain")).toHaveLength(1);
    expect(ofType(markupSignals(`@a: 1px;\n@b: @a;\n@c: @b;`, { fileName: "v.less" }), "variable-chain")).toHaveLength(1);
    const vue = `<template><p>x</p></template><style>:root { --a: red; --b: var(--a); --c: var(--b); }</style>`;
    expect(ofType(markupSignals(vue, { fileName: "A.vue" }), "variable-chain")).toHaveLength(1);
  });

  it("stays quiet for one alias, fallbacks, computed values, themed variables, and !default", () => {
    const quiet = [
      `:root { --blue: #00f; --primary: var(--blue); }`,
      `:root { --a: var(--b, red); --c: var(--a, blue); }`,
      `:root { --a: calc(var(--b) * 2); --c: var(--a); }`,
      `:root { --a: var(--b); --c: var(--a); } [data-theme="dark"] { --a: var(--d); }`,
    ];
    for (const source of quiet) expect(ofType(markupSignals(source, { fileName: "t.css" }), "variable-chain")).toEqual([]);
    expect(ofType(markupSignals(`$a: 1px;\n$b: $a !default;\n$c: $b !default;`, { fileName: "v.scss" }), "variable-chain")).toEqual([]);
  });
});

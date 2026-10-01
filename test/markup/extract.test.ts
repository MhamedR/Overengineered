import { describe, expect, it } from "vitest";
import { extractMarkupFacts, filterMarkupFacts } from "../../src/markup/extract";

describe("markup facts", () => {
  it("measures depth from the page content and skips html, body, head, scripts, and svg internals", () => {
    const source = `<!DOCTYPE html>
<html><head><title>T</title><meta charset="utf-8"></head>
<body>
  <main class="page"><section><p>Hello <b>there</b></p></section></main>
  <svg viewBox="0 0 1 1"><g><g><path d="M0 0"/></g></g></svg>
  <script>const x = "<div><div></div></div>";</script>
</body></html>`;
    const facts = extractMarkupFacts(source, "page.html", "html");
    expect(facts.elements.map((element) => [element.tag, element.depth])).toEqual([
      ["main", 1],
      ["section", 2],
      ["p", 3],
      ["b", 4],
      ["svg", 1],
    ]);
    expect(facts.elements[0]).toMatchObject({ attributes: 1, ownText: false, parent: -1 });
    expect(facts.elements[2]).toMatchObject({ ownText: true, parent: 1 });
    expect(source.slice(facts.elements[1]?.span.start, facts.elements[1]?.span.end)).toBe(
      "<section><p>Hello <b>there</b></p></section>",
    );
  });

  it("treats the Vue root template as transparent and keeps component names", () => {
    const source = `<template>
  <div><MyCard :title="t" /></div>
</template>
<script setup>const t = 1;</script>`;
    const facts = extractMarkupFacts(source, "Card.vue", "vue");
    expect(facts.elements.map((element) => [element.tag, element.depth, element.attributes])).toEqual([
      ["div", 1, 0],
      ["MyCard", 2, 1],
    ]);
  });

  it("counts Svelte template expressions as text of their own", () => {
    const facts = extractMarkupFacts(`<div>{#if open}<span>x</span>{/if}</div>`, "Menu.svelte", "svelte");
    expect(facts.elements[0]).toMatchObject({ tag: "div", ownText: true });
  });

  it("reads embedded style blocks with their language and source offsets", () => {
    const source = `<template><p>x</p></template>
<style lang="scss">
.card { color: red; &:hover { color: blue !important; } .title { margin: 0; } }
</style>
<style lang="stylus">
.ignored
  color red
</style>`;
    const facts = extractMarkupFacts(source, "Card.vue", "vue");
    expect(facts.rules.map((rule) => rule.selectors)).toEqual([[".card"], [".card:hover"], [".card .title"]]);
    expect(facts.rules.map((rule) => rule.syntax)).toEqual(["scss", "scss", "scss"]);
    const hover = facts.rules[1];
    expect(hover?.declarations).toEqual([expect.objectContaining({ property: "color", value: "blue", important: true })]);
    expect(source.slice(hover?.span.start, hover?.span.end)).toBe("&:hover { color: blue !important; }");
  });

  it("resolves nesting, at-rule context, and variables in each style syntax", () => {
    const scss = extractMarkupFacts(
      `$brand: #f00;\n$accent: $brand;\n.nav { a, button { color: $accent; } @media (min-width: 40em) { gap: 1rem; } }\n:root { --a: var(--b); }`,
      "site.scss",
      "scss",
    );
    expect(scss.rules.map((rule) => [rule.selectors, rule.context])).toEqual([
      [[".nav"], ""],
      [[".nav a", ".nav button"], ""],
      [[".nav"], "@media (min-width: 40em)"],
      [[":root"], ""],
    ]);
    expect(scss.variables.map((variable) => [variable.name, variable.value])).toEqual([
      ["$brand", "#f00"],
      ["$accent", "$brand"],
      ["--a", "var(--b)"],
    ]);

    const less = extractMarkupFacts(`@base: 4px;\n@gap: @base;\n.mixin(@x) { margin: @x; }\n.box { .mixin(1px); padding: @gap; }`, "site.less", "less");
    expect(less.variables.map((variable) => variable.name)).toEqual(["@base", "@gap"]);
    expect(less.rules.map((rule) => rule.selectors)).toEqual([[".box"]]);

    const css = extractMarkupFacts(`@media print { a, b > c { color: red } }\n@keyframes spin { from { opacity: 0 } }`, "site.css", "css");
    expect(css.rules.map((rule) => [rule.selectors, rule.context])).toEqual([[["a", "b > c"], "@media print"]]);
  });

  it("keeps only the elements and rules inside a selection", () => {
    const source = `<div><span>a</span></div>\n<section><p>b</p></section>`;
    const facts = extractMarkupFacts(source, "page.html", "html");
    const start = source.indexOf("<section>");
    const scoped = filterMarkupFacts(facts, source, { start, end: source.length });
    expect(scoped.elements.map((element) => [element.tag, element.parent])).toEqual([
      ["section", -1],
      ["p", 0],
    ]);
    expect(scoped.linesOfCode).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { markupSignals, ofType } from "./helpers";

describe("wrapper chains", () => {
  it("reports nested wrappers that only surround one element", () => {
    const signals = ofType(
      markupSignals(`<section class="card"><div><div><div><h2>Title</h2></div></div></div></section>`),
      "wrapper-chain",
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ severity: "medium", title: "Wrappers add nesting without content" });
    expect(signals[0]?.evidence[0]).toBe("3 nested wrappers surround a single h2 element: div > div > div > h2.");
    expect(signals[0]?.locations[0]?.name).toBe("div > div > div > h2");
  });

  it("reports the same shape in Vue and Svelte templates", () => {
    expect(ofType(markupSignals(`<template><div><span><MyButton /></span></div></template>`, { fileName: "A.vue" }), "wrapper-chain")).toHaveLength(1);
    expect(ofType(markupSignals(`<div><div><Child /></div></div>`, { fileName: "A.svelte" }), "wrapper-chain")).toHaveLength(1);
  });

  it("stays quiet for a single wrapper, wrappers with attributes or text, semantic elements, and directives", () => {
    const quiet = [
      `<div><p>One wrapper is common.</p></div>`,
      `<div class="outer"><div class="inner"><p>x</p></div></div>`,
      `<div><div>Label<p>x</p></div></div>`,
      `<ul><li><a href="/">Home</a></li></ul>`,
      `<div><div><p>a</p><p>b</p></div></div>`,
    ];
    for (const source of quiet) expect(ofType(markupSignals(source), "wrapper-chain")).toEqual([]);
    expect(ofType(markupSignals(`<template><div v-if="open"><div><Card /></div></div></template>`, { fileName: "A.vue" }), "wrapper-chain")).toEqual([]);
    expect(ofType(markupSignals(`<div>{#if open}<div><Card /></div>{/if}</div>`, { fileName: "A.svelte" }), "wrapper-chain")).toEqual([]);
  });

  it("stays quiet for minified and vendor files", () => {
    const source = `<div><div><div><p>x</p></div></div></div>`;
    expect(markupSignals(source, { fileName: "vendor/widget.html" })).toEqual([]);
    expect(markupSignals(source, { fileName: "page.min.html" })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { ofType, signalsFor } from "./helpers";

describe("single-use abstraction", () => {
  it("reports a class that is referenced once", () => {
    const [signal] = ofType(
      signalsFor(`
        class OnlyOnce {}
        const value = new OnlyOnce();
      `),
      "single-use-abstraction",
    );
    expect(signal).toMatchObject({
      severity: "low",
      confidence: 0.45,
      title: "Single-use abstraction",
    });
    expect(signal?.evidence[0]).toContain("OnlyOnce");
  });

  it("stays quiet when the abstraction is used twice", () => {
    const signals = ofType(
      signalsFor(`
        class UsedTwice {}
        const first = new UsedTwice();
        const second = new UsedTwice();
      `),
      "single-use-abstraction",
    );
    expect(signals).toEqual([]);
  });

  it("stays quiet for an exported declaration and for an unused declaration", () => {
    const signals = ofType(
      signalsFor(`
        export class PublicApi {}
        const value = new PublicApi();
        class Unused {}
      `),
      "single-use-abstraction",
    );
    expect(signals).toEqual([]);
  });

  it("stays quiet for a PascalCase function in a TSX file", () => {
    const signals = ofType(
      signalsFor(`function Button() { return <div />; }\nconst view = Button();\n`, { fileName: "Button.tsx" }),
      "single-use-abstraction",
    );
    expect(signals).toEqual([]);
  });

  it("stays quiet in a test file", () => {
    const signals = signalsFor(
      `
        class OnlyOnce {}
        const value = new OnlyOnce();
      `,
      { fileName: "widget.test.ts" },
    );
    expect(signals).toEqual([]);
  });
});

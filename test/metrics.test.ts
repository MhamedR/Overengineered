import { describe, expect, it } from "vitest";
import { deriveMetrics } from "../src/metrics";
import { extractFacts } from "../src/parse/extract";
import { loggerSource } from "./fixtures/logger";

describe("deriveMetrics", () => {
  it("summarizes the logger sample without treating complexity as a verdict", () => {
    const metrics = deriveMetrics(extractFacts(loggerSource, "logger.ts", "typescript"));

    expect(metrics).toMatchObject({
      classes: 3,
      interfaces: 1,
      functions: 3,
      abstractions: 4,
      dependencyCount: 1,
      inheritanceDepth: 0,
      callDepth: 0,
      cyclomaticComplexity: 4,
      filesTouched: 1,
      indirectionLayers: 0,
      singleUseAbstractions: 1,
      structuralStatements: 4,
      behavioralStatements: 1,
    });
  });

  it("measures inheritance within the file", () => {
    const metrics = deriveMetrics(
      extractFacts(
        `class C {}
        class B extends C {}
        class A extends B {}
        class D extends External {}`,
        "tree.ts",
        "typescript",
      ),
    );

    expect(metrics.inheritanceDepth).toBe(2);
  });

  it("stops on an inheritance cycle", () => {
    const metrics = deriveMetrics(
      extractFacts(
        `class A extends B {}
        class B extends A {}`,
        "cycle.ts",
        "typescript",
      ),
    );

    expect(metrics.inheritanceDepth).toBe(2);
  });

  it("counts local call depth and keeps real work out of the indirection chain", () => {
    const forwarding = deriveMetrics(
      extractFacts(
        `function a() { b(); }
        function b() { c(); }
        function c() { d(); }
        function d() { return 1; }`,
        "chain.ts",
        "typescript",
      ),
    );
    expect(forwarding.callDepth).toBe(3);
    expect(forwarding.indirectionLayers).toBe(3);

    const working = deriveMetrics(
      extractFacts(
        `function a() {
          const ready = true;
          if (ready) b();
        }
        function b() { return 1; }`,
        "work.ts",
        "typescript",
      ),
    );
    expect(working.callDepth).toBe(1);
    expect(working.indirectionLayers).toBe(0);
  });

  it("counts this-method chains as indirection", () => {
    const metrics = deriveMetrics(
      extractFacts(
        `class S {
          a() { return this.b(); }
          b() { return this.c(); }
          c() { return 1; }
        }`,
        "s.ts",
        "typescript",
      ),
    );

    expect(metrics.callDepth).toBe(2);
    expect(metrics.indirectionLayers).toBe(2);
  });

  it("ignores primitive and inline-object constructor parameters", () => {
    const metrics = deriveMetrics(
      extractFacts(
        `class C {
          constructor(private label: string, private logger: Logger, options: { debug: boolean }) {}
        }`,
        "c.ts",
        "typescript",
      ),
    );

    expect(metrics.dependencyCount).toBe(1);
  });

  it("counts an abstraction once when it has one reference", () => {
    const metrics = deriveMetrics(
      extractFacts(
        `class Unused {}
        class OnlyOnce {}
        const value = new OnlyOnce();`,
        "once.ts",
        "typescript",
      ),
    );

    expect(metrics.singleUseAbstractions).toBe(1);
  });
});

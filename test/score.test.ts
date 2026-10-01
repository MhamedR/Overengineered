import { describe, expect, it } from "vitest";
import { scoreSignals } from "../src/score";
import type { Signal, SignalType, Severity } from "../src/types";

function signal(type: SignalType, severity: Severity, clusterId: string, confidence = 1): Signal {
  return {
    type,
    severity,
    confidence,
    title: type,
    evidence: ["evidence"],
    interpretation: "interpretation",
    legitimateReasons: [],
    questions: [],
    locations: [],
    clusterId,
  };
}

describe("scoreSignals", () => {
  it("returns a low estimate when there are no signals", () => {
    expect(scoreSignals([], true)).toEqual({ score: 0, band: "low", confidence: 0.45 });
    expect(scoreSignals([], false)).toEqual({ score: 0, band: "low", confidence: 0.7 });
  });

  it("places two independent medium signals in moderate concern", () => {
    const estimate = scoreSignals(
      [signal("delegation-only", "medium", "a"), signal("single-product-factory", "medium", "b")],
      false,
    );
    expect(estimate).toMatchObject({ score: 51, band: "moderate", confidence: 1 });
  });

  it("keeps one medium signal in low concern", () => {
    expect(scoreSignals([signal("delegation-only", "medium", "a")], false)).toMatchObject({ score: 30, band: "low" });
  });

  it("dampens signals that describe the same layer", () => {
    const clustered = scoreSignals(
      [signal("single-implementation-interface", "medium", "abstraction:Logger"), signal("single-product-factory", "medium", "abstraction:Logger")],
      false,
    );
    const separate = scoreSignals(
      [signal("single-implementation-interface", "medium", "abstraction:Logger"), signal("single-product-factory", "medium", "factory:LoggerFactory")],
      false,
    );
    expect(clustered.score).toBe(37);
    expect(separate.score).toBe(51);
  });

  it("lowers the estimate when project context is partial", () => {
    const signals = [signal("delegation-only", "medium", "a"), signal("single-product-factory", "medium", "b")];
    expect(scoreSignals(signals, true).score).toBe(41);
    expect(scoreSignals(signals, false).score).toBe(51);
  });

  it("keeps a single high-severity signal below high concern", () => {
    expect(scoreSignals([signal("delegation-only", "high", "a")], false)).toMatchObject({ score: 46, band: "moderate" });
  });

  it("reaches high and very high concern as independent signals accumulate", () => {
    const high = scoreSignals(
      [
        signal("delegation-only", "medium", "a"),
        signal("single-product-factory", "medium", "b"),
        signal("single-strategy", "medium", "c"),
        signal("single-implementation-interface", "medium", "d"),
      ],
      false,
    );
    expect(high).toMatchObject({ score: 76, band: "high" });

    const veryHigh = scoreSignals(
      Array.from({ length: 6 }, (_, index) => signal("delegation-only", "high", `cluster-${index}`)),
      false,
    );
    expect(veryHigh).toMatchObject({ score: 98, band: "very-high" });
  });
});

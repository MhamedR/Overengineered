import { describe, expect, it } from "vitest";
import { donutSegments, renderStatementMix, renderThresholds, severityCounts, typeBars } from "../src/ui/charts";
import type { Severity, Signal, SignalType } from "../src/types";

function signal(type: SignalType, severity: Severity): Signal {
  return {
    type,
    severity,
    confidence: 0.5,
    title: type,
    evidence: [],
    interpretation: "",
    legitimateReasons: [],
    questions: [],
    locations: [],
    clusterId: type,
  };
}

describe("charts", () => {
  const signals = [
    signal("delegation-only", "medium"),
    signal("delegation-only", "low"),
    signal("single-use-abstraction", "low"),
    signal("high-dependency-count", "high"),
  ];

  it("splits the donut circle in proportion to severity counts", () => {
    const segments = donutSegments(severityCounts(signals));
    const circumference = 2 * Math.PI * 42;
    expect(segments.map((segment) => [segment.severity, segment.count])).toEqual([
      ["high", 1],
      ["medium", 1],
      ["low", 2],
    ]);
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    expect(total).toBeCloseTo(circumference);
    expect(segments[2]?.offset).toBeCloseTo(circumference / 2);
  });

  it("returns no donut segments when there are no signals", () => {
    expect(donutSegments(severityCounts([]))).toEqual([]);
  });

  it("orders type bars by count and stacks severities", () => {
    const bars = typeBars(signals);
    expect(bars[0]).toMatchObject({ type: "delegation-only", total: 2, counts: { medium: 1, low: 1 } });
    expect(bars.map((bar) => bar.type)).toEqual(["delegation-only", "high-dependency-count", "single-use-abstraction"]);
  });

  it("marks a value above its setting", () => {
    const html = renderThresholds([{ label: "Call depth", value: 6, limit: 4 }]);
    expect(html).toContain('class="bar-part over"');
    expect(html).toContain("6 / 4");
  });

  it("shows structural and behavioral shares", () => {
    const html = renderStatementMix(3, 1);
    expect(html).toContain("3 · 75%");
    expect(html).toContain("1 · 25%");
    expect(renderStatementMix(0, 0)).toContain("No statements in this scope.");
  });
});

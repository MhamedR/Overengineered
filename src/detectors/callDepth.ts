import { longestCallChain } from "../metrics";
import type { Facts, Severity, Signal, Span } from "../types";
import { location, withReviewContext } from "./support";
import type { Detector } from "./types";

export const callDepthDetector: Detector = {
  id: "deep-indirection",
  detect(input): Signal[] {
    const limit = input.settings.maxCallDepth;
    const forward = longestCallChain(input.facts, true);
    const full = longestCallChain(input.facts, false);
    if (forward.depth <= limit && full.depth <= limit) return [];

    const passThrough = forward.depth > limit;
    const depth = passThrough ? forward.depth : full.depth;
    const start = (passThrough ? forward.start : full.start) ?? input.facts.fileName;
    const span = callableSpan(input.facts, start) ?? { start: 0, end: 0 };
    const signal: Omit<Signal, "confidence" | "legitimateReasons"> & { confidence: number; legitimateReasons: string[] } = {
      type: "deep-indirection",
      severity: passThrough ? passThroughSeverity(depth, limit) : "low",
      confidence: 0.75,
      title: passThrough ? "Call chain only forwards" : "Local call chain is deep",
      evidence: [
        `The longest local call chain is ${depth} steps. The setting allows ${limit}.`,
        passThrough
          ? "The steps in that chain only forward their arguments."
          : "The steps in that chain contain their own logic.",
      ],
      interpretation: passThrough
        ? "A chain of forwarding calls adds layers between the first function and the work. Each layer may still be a boundary worth keeping."
        : "A deep chain of functions that each do their own work is weaker evidence of extra indirection.",
      legitimateReasons: ["Each step may isolate a branch, a side effect, or a boundary the caller should not cross."],
      questions: ["Is this code intended to be reused?", "Is this architecture intentionally designed for future extension?"],
      locations: [location(input.facts, start, span)],
      clusterId: `indirection:${start}`,
    };
    return [withReviewContext(input, signal)];
  },
};

function passThroughSeverity(depth: number, limit: number): Severity {
  return depth >= limit + 2 ? "high" : "medium";
}

function callableSpan(facts: Facts, name: string): Span | undefined {
  const fn = facts.functions.find((item) => item.name === name);
  if (fn) return fn.span;
  const dot = name.indexOf(".");
  if (dot < 0) return undefined;
  const cls = facts.classes.find((item) => item.name === name.slice(0, dot));
  return cls?.methods.find((method) => method.name === name.slice(dot + 1))?.span;
}

import type { Facts, Signal, Span } from "../types";
import { location, withReviewContext } from "./support";
import type { Detector } from "./types";

const MIN_STRUCTURAL = 4;
const MAX_BEHAVIORAL = 5;
const MIN_RATIO = 0.75;

export const boilerplateDetector: Detector = {
  id: "excessive-boilerplate",
  detect(input): Signal[] {
    const structural = input.facts.structuralStatements;
    const behavioral = input.facts.behavioralStatements;
    const total = structural + behavioral;
    if (structural < MIN_STRUCTURAL || behavioral >= MAX_BEHAVIORAL || total === 0) return [];
    if (structural / total <= MIN_RATIO) return [];

    const anchor = anchorOf(input.facts);
    return [
      withReviewContext(input, {
        type: "excessive-boilerplate",
        severity: "low",
        confidence: 0.75,
        title: "Structure outweighs behavior",
        evidence: [`This file has ${structural} structural statements and ${behavioral} behavioral statement${behavioral === 1 ? "" : "s"}.`],
        interpretation:
          "Most of the analyzed code names types, forwards calls, or declares parameters. Little of it changes values or makes decisions.",
        legitimateReasons: ["The structure may be the public shape of a library or a boundary other code depends on."],
        questions: ["Is this code intended to be reused?", "Is this architecture intentionally designed for future extension?"],
        locations: [location(input.facts, anchor.name, anchor.span)],
        clusterId: `boilerplate:${input.facts.fileName}`,
      }),
    ];
  },
};

function anchorOf(facts: Facts): { name: string; span: Span } {
  const candidates = [...facts.interfaces, ...facts.classes, ...facts.functions, ...facts.typeAliases];
  candidates.sort((left, right) => left.span.start - right.span.start);
  const first = candidates[0];
  return first ? { name: first.name, span: first.span } : { name: facts.fileName, span: { start: 0, end: 0 } };
}

import type { Severity, Signal } from "../../types";
import { elementPath, wrapperChains } from "../shape";
import { markupLocation, type MarkupDetector } from "./types";

export const MIN_WRAPPER_CHAIN = 2;

export const wrapperChainDetector: MarkupDetector = {
  id: "wrapper-chain",
  detect({ facts }): Signal[] {
    const signals: Signal[] = [];
    for (const chain of wrapperChains(facts)) {
      const count = chain.wrappers.length;
      if (count < MIN_WRAPPER_CHAIN) continue;
      const outer = facts.elements[chain.wrappers[0] ?? -1];
      const inner = facts.elements[chain.inner];
      if (!outer || !inner) continue;
      const path = elementPath(facts, [...chain.wrappers, chain.inner]);
      signals.push({
        type: "wrapper-chain",
        severity: severity(count),
        confidence: 0.6,
        title: "Wrappers add nesting without content",
        evidence: [
          `${count} nested wrappers surround a single ${inner.tag} element: ${path}.`,
          "None of these wrappers has attributes or text of its own.",
        ],
        interpretation:
          "A wrapper with no class, attributes, or text adds a level to the page structure. Its purpose may live in a stylesheet that selects it by position.",
        legitimateReasons: [
          "A stylesheet may select these wrappers by position, for example with a child combinator.",
          "A layout or animation library may expect this exact structure.",
          "A template or component may add the wrappers for content that is sometimes present.",
        ],
        questions: ["Does a stylesheet or script select these wrappers by position?", "Could the inner element sit directly in the parent?"],
        locations: [markupLocation(facts, path, { start: outer.span.start, end: outer.span.end })],
        clusterId: `nesting:${facts.fileName}`,
      });
    }
    return signals;
  },
};

function severity(count: number): Severity {
  if (count >= 4) return "high";
  if (count >= 3) return "medium";
  return "low";
}

import type { Signal } from "../../types";
import { duplicateGroups } from "../shape";
import { MAX_LOCATIONS, markupLocation, type MarkupDetector } from "./types";

export const duplicateDeclarationsDetector: MarkupDetector = {
  id: "duplicate-declarations",
  detect({ facts }): Signal[] {
    return duplicateGroups(facts).map((group) => {
      const selectors = group.rules.map((rule) => rule.selectors.join(", "));
      const first = group.rules[0];
      return {
        type: "duplicate-declarations",
        severity: group.rules.length >= 3 ? "medium" : "low",
        confidence: 0.7,
        title: "Rules repeat the same declarations",
        evidence: [
          `${group.rules.length} rules repeat the same ${group.declarations} declarations: ${selectors.join("; ")}.`,
          first?.context ? `They share the same context: ${first.context}.` : "They sit at the same level, outside any at-rule.",
        ],
        interpretation:
          "A repeated block means one visual change has to be made in several places. The copies may also be deliberate and expected to diverge.",
        legitimateReasons: [
          "The rules may be expected to change independently later.",
          "Generated or vendor stylesheets often repeat blocks.",
        ],
        questions: ["Would a shared class or variable remove the repetition?", "Are these rules expected to change independently?"],
        locations: group.rules.slice(0, MAX_LOCATIONS).map((rule) => markupLocation(facts, rule.selectors.join(", "), rule.span)),
        clusterId: `duplicate:${selectors[0] ?? ""}`,
      };
    });
  },
};

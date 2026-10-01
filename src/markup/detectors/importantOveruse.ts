import type { Signal } from "../../types";
import { importantCounts, isUtilityRule } from "../shape";
import { MAX_LOCATIONS, markupLocation, type MarkupDetector } from "./types";

export const MIN_IMPORTANT = 5;

export const importantOveruseDetector: MarkupDetector = {
  id: "important-overuse",
  detect({ facts }): Signal[] {
    const counts = importantCounts(facts);
    if (counts.important < MIN_IMPORTANT) return [];

    const share = counts.total === 0 ? 0 : counts.important / counts.total;
    const evidence = [`${counts.important} of ${counts.total} declarations use !important (${Math.round(share * 100)}%).`];
    if (counts.utility === 1) evidence.push("1 more sits in a single-class utility rule and is left out of that count.");
    if (counts.utility > 1) evidence.push(`${counts.utility} more sit in single-class utility rules and are left out of that count.`);
    const rules = facts.rules.filter((rule) => !isUtilityRule(rule) && rule.declarations.some((item) => item.important));

    return [
      {
        type: "important-overuse",
        severity: counts.important >= 10 && share >= 0.2 ? "medium" : "low",
        confidence: 0.65,
        title: "Many declarations use !important",
        evidence,
        interpretation:
          "Each !important wins over normal specificity. Repeated use often means rules are competing, and the next change needs !important as well.",
        legitimateReasons: [
          "Overriding inline styles or a third-party stylesheet may need !important.",
          "Styles that must always win, such as reduced-motion or print rules, often use it on purpose.",
        ],
        questions: ["Is this selector overriding styles you do not control?", "Which rules are these declarations competing with?"],
        locations: rules.slice(0, MAX_LOCATIONS).map((rule) => markupLocation(facts, rule.selectors.join(", "), rule.span)),
        clusterId: `specificity:${facts.fileName}`,
      },
    ];
  },
};

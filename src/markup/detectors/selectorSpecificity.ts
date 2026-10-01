import type { Severity, Signal } from "../../types";
import { formatSpecificity, isOverSpecific, measurableSelectors, type SelectorShape } from "../shape";
import { MAX_LOCATIONS, markupLocation, type MarkupDetector } from "./types";

const EXAMPLES = 3;

export const selectorSpecificityDetector: MarkupDetector = {
  id: "selector-specificity",
  detect({ facts }): Signal[] {
    const flagged = measurableSelectors(facts.rules)
      .filter(isOverSpecific)
      .sort((left, right) => right.compounds - left.compounds || right.specificity[0] - left.specificity[0]);
    if (flagged.length === 0) return [];

    const longest = flagged[0]?.compounds ?? 0;
    const nested = facts.rules.some((rule) => rule.syntax !== "css");
    const legitimateReasons = [
      "Overriding a third-party stylesheet may need a stronger selector.",
      "Content from a CMS or a library may leave no class to target.",
    ];
    if (nested) legitimateReasons.push("Nested SCSS or Less rules can produce long selectors that read simply in the source.");

    return [
      {
        type: "selector-specificity",
        severity: severity(flagged.length),
        confidence: 0.65,
        title: "Selectors are long or highly specific",
        evidence: [
          flagged.length === 1
            ? `1 selector has five or more parts, or uses an id together with other parts. It has ${longest} parts.`
            : `${flagged.length} selectors have five or more parts, or use an id together with other parts. The longest has ${longest} parts.`,
          ...flagged.slice(0, EXAMPLES).map(describe),
        ],
        interpretation:
          "Long or specific selectors tie styles to the exact structure of the page. Changing that structure, or overriding the style, then takes an even stronger selector.",
        legitimateReasons,
        questions: ["Is this selector overriding styles you do not control?", "Would a single class on the element describe it?"],
        locations: flagged.slice(0, MAX_LOCATIONS).map((shape) => {
          const rule = facts.rules.find((item) => item.selectors.includes(shape.selector));
          return markupLocation(facts, shape.selector, rule?.span ?? { start: 0, end: 0 });
        }),
        clusterId: `specificity:${facts.fileName}`,
      },
    ];
  },
};

function describe(shape: SelectorShape): string {
  return `${shape.selector} has ${shape.compounds} ${shape.compounds === 1 ? "part" : "parts"} and specificity ${formatSpecificity(shape.specificity)}.`;
}

function severity(count: number): Severity {
  if (count >= 10) return "high";
  if (count >= 3) return "medium";
  return "low";
}

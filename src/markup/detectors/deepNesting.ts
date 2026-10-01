import type { Signal } from "../../types";
import { ancestorsOf, deepestElement, isBareContainer } from "../shape";
import { markupLocation, type MarkupDetector } from "./types";

export const deepNestingDetector: MarkupDetector = {
  id: "deep-nesting",
  detect({ facts, settings }): Signal[] {
    const index = deepestElement(facts);
    const deepest = facts.elements[index];
    const limit = settings.maxNestingDepth;
    if (!deepest || deepest.depth <= limit) return [];

    const ancestors = ancestorsOf(facts, index);
    const bare = ancestors.filter((ancestor) => {
      const element = facts.elements[ancestor];
      return element !== undefined && isBareContainer(element);
    }).length;
    const evidence = [`The deepest element, ${deepest.tag}, sits ${deepest.depth} levels deep. The setting allows ${limit}.`];
    if (bare > 0) {
      evidence.push(`${bare} of the ${ancestors.length} elements above it are div or span elements with no attributes or text of their own.`);
    }

    return [
      {
        type: "deep-nesting",
        severity: deepest.depth - limit >= 4 ? "medium" : "low",
        confidence: bare > 0 ? 0.65 : 0.5,
        title: "Markup is nested deeply",
        evidence,
        interpretation:
          "Each level of nesting is another box to style and another step for anyone reading the markup. Deep trees often grow when layout is solved by adding containers.",
        legitimateReasons: [
          "Tables, forms, and navigation menus often need several levels that each carry meaning.",
          "Components can add levels that each have a role of their own.",
        ],
        questions: ["Could the layout use fewer levels with grid or flexbox?", "Does a stylesheet or script select these wrappers by position?"],
        locations: [markupLocation(facts, deepest.tag, deepest.span)],
        clusterId: `nesting:${facts.fileName}`,
      },
    ];
  },
};

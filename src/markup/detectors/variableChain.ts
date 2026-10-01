import type { Signal } from "../../types";
import { variableChains } from "../shape";
import { markupLocation, type MarkupDetector } from "./types";

export const MIN_VARIABLE_HOPS = 2;

export const variableChainDetector: MarkupDetector = {
  id: "variable-chain",
  detect({ facts }): Signal[] {
    const signals: Signal[] = [];
    for (const chain of variableChains(facts)) {
      if (chain.hops < MIN_VARIABLE_HOPS) continue;
      const first = facts.variables.find((variable) => variable.name === chain.names[0]);
      if (!first) continue;
      const path = chain.names.join(" → ");
      signals.push({
        type: "variable-chain",
        severity: chain.hops >= 3 ? "medium" : "low",
        confidence: 0.55,
        title: "Variables only point to other variables",
        evidence: [
          `${path}: ${chain.hops} variables in a row only pass along another variable's value.`,
          "Each of these variables is defined once in this file.",
        ],
        interpretation:
          "One alias can give a value a name that fits where it is used. A chain of aliases makes readers follow several steps to find the actual value.",
        legitimateReasons: [
          "Other stylesheets may redefine these variables, for example for a theme.",
          "A design-token system may keep one layer for brand values and one for components.",
        ],
        questions: ["Does each variable layer have a different reason to change?"],
        locations: [markupLocation(facts, chain.names[0] ?? path, first.span)],
        clusterId: `variables:${chain.names.at(-1) ?? path}`,
      });
    }
    return signals;
  },
};

import type { Signal } from "../types";
import { hasExternalImplementer, implementersOf, location, withReviewContext } from "./support";
import type { Detector } from "./types";

export const strategyDetector: Detector = {
  id: "single-strategy",
  detect(input): Signal[] {
    const signals: Signal[] = [];
    for (const iface of input.facts.interfaces) {
      const implementers = implementersOf(input.facts, iface.name);
      if (implementers.length !== 1) continue;
      if (hasExternalImplementer(input.facts, iface.name, input.context)) continue;
      const implementer = implementers[0];
      if (!implementer) continue;
      if (!iface.name.endsWith("Strategy") && !implementer.name.endsWith("Strategy")) continue;

      signals.push(
        withReviewContext(input, {
          type: "single-strategy",
          severity: "medium",
          confidence: 0.75,
          title: "Strategy has only one implementation",
          evidence: [
            `${iface.name} has one concrete strategy in the ${input.context.partial ? "analyzed code" : "project"}: ${implementer.name}.`,
            `No other strategy was found in the ${input.context.partial ? "analyzed code" : "project"}.`,
          ],
          interpretation:
            "A strategy abstraction with one implementation can be reserved for a variation that has not arrived. The naming is what makes this look like that pattern.",
          legitimateReasons: [
            "A second strategy may live in another module.",
            "The name may describe a role even when only one variation exists today.",
          ],
          questions: ["Is another implementation expected?", "Is this architecture intentionally designed for future extension?"],
          locations: [location(input.facts, iface.name, iface.span), location(input.facts, implementer.name, implementer.span)],
          clusterId: `abstraction:${iface.name}`,
        }),
      );
    }
    return signals;
  },
};

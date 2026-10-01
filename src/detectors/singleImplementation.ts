import type { Signal } from "../types";
import {
  hasExternalImplementer,
  hasFrameworkDecorator,
  implementersOf,
  inPortsDirectory,
  isPublicEntry,
  location,
  soften,
  withReviewContext,
} from "./support";
import type { Detector } from "./types";

const questions = [
  "Is another implementation expected?",
  "Is this abstraction required by a framework?",
  "Is this code intended to be reused?",
  "Is this architecture intentionally designed for future extension?",
];

export const singleImplementationDetector: Detector = {
  id: "single-implementation-interface",
  detect(input): Signal[] {
    const signals: Signal[] = [];
    for (const iface of input.facts.interfaces) {
      const implementers = implementersOf(input.facts, iface.name);
      if (implementers.length !== 1) continue;
      if (hasExternalImplementer(input.facts, iface.name, input.context)) continue;
      const implementer = implementers[0];
      if (!implementer) continue;

      let severity = input.settings.singleImplementationSeverity;
      const legitimateReasons = [
        "Dependency inversion can justify one implementation.",
        "Tests may need a seam even when production code has one implementation.",
        "A framework or public API may require the interface.",
        "Another implementation may be planned.",
      ];
      const publicApi = iface.exported || isPublicEntry(input.facts.fileName);
      const framework = hasFrameworkDecorator(implementer);
      const ports = inPortsDirectory(input.facts.fileName);
      if (publicApi || framework || ports) severity = soften(severity);
      if (publicApi) legitimateReasons.push("This interface is exported, so it may be part of a public API.");
      if (framework) legitimateReasons.push("Decorators on the implementation suggest a framework may require this shape.");
      if (ports) legitimateReasons.push("The file sits in a ports directory, which is often an intentional architecture seam.");

      signals.push(
        withReviewContext(input, {
          type: "single-implementation-interface",
          severity,
          confidence: 0.75,
          title: "Interface has only one implementation",
          evidence: [
            `${iface.name} has one implementation in the ${input.context.partial ? "analyzed code" : "project"}: ${implementer.name}.`,
            `No other implementation was found in the ${input.context.partial ? "analyzed code" : "project"}.`,
          ],
          interpretation: "A single implementation can still be a useful seam. This is evidence to review.",
          legitimateReasons,
          questions,
          locations: [location(input.facts, iface.name, iface.span), location(input.facts, implementer.name, implementer.span)],
          clusterId: `abstraction:${iface.name}`,
        }),
      );
    }
    return signals;
  },
};

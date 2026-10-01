import type { ClassFact, Facts, Signal } from "../types";
import { location, soften, withReviewContext } from "./support";
import type { Detector } from "./types";

const dependencyForward = /^this\.[A-Za-z_$][\w$]*(?:\?\.|\.)/;

export const delegationDetector: Detector = {
  id: "delegation-only",
  detect(input): Signal[] {
    const signals: Signal[] = [];
    for (const cls of input.facts.classes) {
      for (const method of cls.methods) {
        if (method.kind !== "method" || method.body !== "forward-call" || !method.callee) continue;
        if (!dependencyForward.test(method.callee)) continue;

        const adapter = methodSatisfiesInterface(cls, method.name, input.facts);
        signals.push(
          withReviewContext(input, {
            type: "delegation-only",
            severity: adapter ? soften("medium") : "medium",
            confidence: 0.75,
            title: "Method only forwards a call",
            evidence: [`${cls.name}.${method.name} only forwards to ${method.callee}.`, "The method adds no other statements and does not change the arguments."],
            interpretation: "A forwarding method can be a boundary worth keeping. Here it adds no behavior of its own in the analyzed code.",
            legitimateReasons: adapter
              ? ["This method matches an interface the class implements, so the forward may be an adapter."]
              : ["The forward may hide a dependency the caller should not construct directly."],
            questions: ["Is this abstraction required by a framework?", "Is this code intended to be reused?"],
            locations: [location(input.facts, `${cls.name}.${method.name}`, method.span)],
            clusterId: `delegation:${cls.name}.${method.name}`,
          }),
        );
      }
    }
    return signals;
  },
};

function methodSatisfiesInterface(cls: ClassFact, methodName: string, facts: Facts): boolean {
  return cls.implements.some((ref) => facts.interfaces.some((iface) => iface.name === ref.name && iface.members.includes(methodName)));
}

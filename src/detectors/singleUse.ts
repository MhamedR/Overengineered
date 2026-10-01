import type { Signal } from "../types";
import { implementersOf, isComponentFile, location, referenceTotal, withReviewContext } from "./support";
import type { Detector } from "./types";

export const singleUseDetector: Detector = {
  id: "single-use-abstraction",
  detect(input): Signal[] {
    const counts = new Map<string, number>();
    for (const reference of input.facts.references) {
      counts.set(reference.name, (counts.get(reference.name) ?? 0) + 1);
    }

    const signals: Signal[] = [];
    const componentFile = isComponentFile(input.facts.fileName);

    for (const iface of input.facts.interfaces) {
      if (iface.exported || referenceTotal(iface.name, counts.get(iface.name) ?? 0, input.context) !== 1) continue;
      signals.push(signalFor(input, iface.name, iface.span, `abstraction:${iface.name}`));
    }

    for (const cls of input.facts.classes) {
      if (cls.exported || referenceTotal(cls.name, counts.get(cls.name) ?? 0, input.context) !== 1) continue;
      if (componentFile && /^[A-Z]/.test(cls.name)) continue;
      signals.push(signalFor(input, cls.name, cls.span, clusterForClass(cls.name, input.facts)));
    }

    for (const fn of input.facts.functions) {
      if (fn.exported || referenceTotal(fn.name, counts.get(fn.name) ?? 0, input.context) !== 1) continue;
      if (componentFile && /^[A-Z]/.test(fn.name)) continue;
      signals.push(signalFor(input, fn.name, fn.span, `abstraction:${fn.name}`));
    }

    return signals;
  },
};

function clusterForClass(name: string, facts: Parameters<typeof implementersOf>[0]): string {
  const cls = facts.classes.find((item) => item.name === name);
  for (const ref of cls?.implements ?? []) {
    if (implementersOf(facts, ref.name).length === 1) return `abstraction:${ref.name}`;
  }
  return `abstraction:${name}`;
}

function signalFor(
  input: Parameters<typeof withReviewContext>[0],
  name: string,
  span: { start: number; end: number },
  clusterId: string,
): Signal {
  return withReviewContext(input, {
    type: "single-use-abstraction",
    severity: "low",
    confidence: 0.75,
    title: "Single-use abstraction",
    evidence: [`${name} is referenced once in the ${input.context.partial ? "analyzed code" : "project"}.`],
    interpretation:
      "One use can mean the abstraction is premature. It can also be a name for a call site that is expected to grow.",
    legitimateReasons: [
      "The declaration may be exported for callers outside this file.",
      "A single call site can still be clearer with a name.",
    ],
    questions: ["Is this code intended to be reused?", "Is this architecture intentionally designed for future extension?"],
    locations: [location(input.facts, name, span)],
    clusterId,
  });
}

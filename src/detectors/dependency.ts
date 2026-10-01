import type { ClassFact, Severity, Signal } from "../types";
import { hasFrameworkDecorator, location, withReviewContext } from "./support";
import type { Detector } from "./types";

export const dependencyDetector: Detector = {
  id: "high-dependency-count",
  detect(input): Signal[] {
    const limit = input.settings.maxDependencyCount;
    const signals: Signal[] = [];
    for (const cls of input.facts.classes) {
      const count = cls.constructorParameters.filter((parameter) => parameter.countsAsDependency).length;
      if (count <= limit) continue;
      const framework = hasFrameworkDecorator(cls);
      signals.push(
        withReviewContext(input, {
          type: "high-dependency-count",
          severity: dependencySeverity(count, limit, framework),
          confidence: 0.75,
          title: "Constructor takes many dependencies",
          evidence: [`${cls.name} declares ${count} typed constructor dependencies. The setting allows ${limit}.`],
          interpretation:
            "A constructor with many typed dependencies can be a composition root or a framework entry point. The count is a prompt to check whether each dependency earns its place.",
          legitimateReasons: framework
            ? ["This class is marked for a framework that injects constructor dependencies."]
            : ["The class may be the composition root that wires the rest of the program."],
          questions: ["Is this abstraction required by a framework?", "Is this code intended to be reused?"],
          locations: [location(input.facts, cls.name, constructorSpan(cls))],
          clusterId: `dependency:${cls.name}`,
        }),
      );
    }
    return signals;
  },
};

function dependencySeverity(count: number, limit: number, framework: boolean): Severity {
  const excess = count - limit;
  let severity: Severity = excess >= 5 ? "high" : excess >= 3 ? "medium" : "low";
  if (framework && severity === "high" && excess < 7) severity = "medium";
  return severity;
}

function constructorSpan(cls: ClassFact) {
  return cls.methods.find((method) => method.kind === "constructor")?.span ?? cls.span;
}

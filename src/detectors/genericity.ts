import type { Facts, Signal, Span } from "../types";
import { location, withReviewContext } from "./support";
import type { Detector, DetectorInput } from "./types";

interface GenericDeclaration {
  name: string;
  typeParameters: string[];
  span: Span;
  exported: boolean;
}

export const genericityDetector: Detector = {
  id: "unused-genericity",
  detect(input): Signal[] {
    const signals: Signal[] = [];
    for (const declaration of declarations(input.facts)) {
      const uses = concreteUses(declaration, input);
      if (uses.length === 0) continue;
      const signatures = new Set(uses.map((args) => JSON.stringify(args)));
      if (signatures.size !== 1) continue;
      const repeatedSingleParameter = declaration.typeParameters.length === 1 && uses.length >= 2;
      const severalParameters = declaration.typeParameters.length >= 2;
      if (!repeatedSingleParameter && !severalParameters) continue;

      const [argumentsText] = [...signatures].map((signature) => (JSON.parse(signature) as string[]).join(", "));
      signals.push(
        withReviewContext(input, {
          type: "unused-genericity",
          severity: "low",
          confidence: input.context.partial ? 0.35 : 0.75,
          title: "Type parameters stay the same",
          evidence: [
            `${declaration.name} declares ${declaration.typeParameters.length} type parameter${declaration.typeParameters.length === 1 ? "" : "s"}.`,
            `Every explicit instantiation found uses <${argumentsText}>.`,
          ],
          interpretation:
            "A type parameter that is always filled with the same arguments can still document a boundary. In the code that was searched, the arguments do not vary.",
          legitimateReasons: declaration.exported
            ? ["Call sites outside the searched files may pass different type arguments."]
            : ["The parameters may document a constraint even when current callers pass one type."],
          questions: ["Is another implementation expected?", "Is this architecture intentionally designed for future extension?"],
          locations: [location(input.facts, declaration.name, declaration.span)],
          clusterId: `generic:${declaration.name}`,
        }),
      );
    }
    return signals;
  },
};

function declarations(facts: Facts): GenericDeclaration[] {
  return [...facts.interfaces, ...facts.classes, ...facts.functions, ...facts.typeAliases].filter(
    (item) => item.typeParameters.length > 0,
  );
}

function concreteUses(declaration: GenericDeclaration, input: DetectorInput): string[][] {
  const recorded = input.context.genericUses
    ? (input.context.genericUses.get(declaration.name)?.arguments ?? [])
    : input.facts.instantiations.filter((item) => item.name === declaration.name).map((item) => item.typeArguments);
  const parameters = new Set(declaration.typeParameters);
  return recorded
    .map((args) => [...args])
    .filter((args) => args.some((arg) => !parameters.has(arg.trim())));
}

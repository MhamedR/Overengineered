import type { CallableFact, Facts, Signal } from "../types";
import { hasExternalImplementer, implementersOf, location, withReviewContext } from "./support";
import type { Detector, DetectorInput } from "./types";

const factoryFunctionName = /^(create|make|build)[A-Z]/;

export const factoryDetector: Detector = {
  id: "single-product-factory",
  detect(input): Signal[] {
    const signals: Signal[] = [];
    for (const cls of input.facts.classes) {
      if (!cls.name.endsWith("Factory")) continue;
      const products = productsOf(input.facts, (caller) => caller.startsWith(`${cls.name}.`));
      const signal = signalFor(input, cls.name, cls.span, products, `factory:${cls.name}`);
      if (signal) signals.push(signal);
    }

    for (const fn of input.facts.functions) {
      if (!factoryFunctionName.test(fn.name)) continue;
      const products = productsOf(input.facts, (caller) => caller === fn.name);
      const signal = signalFor(input, fn.name, fn.span, products, clusterForProduct(input.facts, products[0] ?? fn.name));
      if (signal) signals.push(signal);
    }

    for (const cls of input.facts.classes) {
      if (cls.name.endsWith("Factory")) continue;
      for (const method of cls.methods) {
        if (!factoryFunctionName.test(method.name)) continue;
        const caller = `${cls.name}.${method.name}`;
        const products = productsOf(input.facts, (name) => name === caller);
        const signal = signalFor(input, caller, method.span, products, clusterForProduct(input.facts, products[0] ?? method.name));
        if (signal) signals.push(signal);
      }
    }

    return signals;
  },
};

function productsOf(facts: Facts, matches: (caller: string) => boolean): string[] {
  const names = new Set<string>();
  for (const construction of facts.constructions) {
    if (matches(construction.caller)) names.add(construction.typeName);
  }
  return [...names];
}

function signalFor(
  input: DetectorInput,
  name: string,
  span: CallableFact["span"],
  products: string[],
  clusterId: string,
): Signal | undefined {
  if (products.length !== 1) return undefined;
  const product = products[0];
  if (!product) return undefined;

  const productClass = input.facts.classes.find((cls) => cls.name === product);
  const hasSiblingImplementation =
    productClass?.implements.some(
      (ref) => implementersOf(input.facts, ref.name).length > 1 || hasExternalImplementer(input.facts, ref.name, input.context),
    ) ?? false;
  const legitimateReasons = ["A factory can still be the place that chooses a default implementation."];
  if (hasSiblingImplementation) {
    legitimateReasons.push("The constructed type's interface has another implementation.");
  }

  return withReviewContext(input, {
    type: "single-product-factory",
    severity: "medium",
    confidence: hasSiblingImplementation ? 0.35 : 0.75,
    title: "Factory has only one product",
    evidence: [`${name} only creates ${product}.`, "No other constructed type was found for this factory."],
    interpretation: "One product can mean the factory is waiting for a second variant. It can also be a single construction site with a name.",
    legitimateReasons,
    questions: ["Is another implementation expected?", "Is this architecture intentionally designed for future extension?"],
    locations: [location(input.facts, name, span)],
    clusterId: hasSiblingImplementation ? clusterId : clusterForProduct(input.facts, product),
  });
}

function clusterForProduct(facts: Facts, product: string): string {
  const cls = facts.classes.find((item) => item.name === product);
  for (const ref of cls?.implements ?? []) {
    if (implementersOf(facts, ref.name).length === 1) return `abstraction:${ref.name}`;
  }
  return `factory:${product}`;
}

import type { BodyKind, ClassFact, CodeMetrics, Facts } from "./types";

export function deriveMetrics(facts: Facts): CodeMetrics {
  return {
    linesOfCode: facts.linesOfCode,
    functions: functionCount(facts),
    classes: facts.classes.length,
    interfaces: facts.interfaces.length,
    abstractions: facts.interfaces.length + facts.classes.length + facts.typeAliases.length,
    dependencyCount: dependencyCount(facts),
    inheritanceDepth: inheritanceDepth(facts.classes),
    callDepth: longestCallChain(facts, false).depth,
    cyclomaticComplexity: cyclomaticComplexity(facts),
    filesTouched: 1,
    indirectionLayers: longestCallChain(facts, true).depth,
    singleUseAbstractions: singleUseAbstractions(facts),
    behavioralStatements: facts.behavioralStatements,
    structuralStatements: facts.structuralStatements,
  };
}

function functionCount(facts: Facts): number {
  const methods = facts.classes.reduce(
    (count, cls) => count + cls.methods.filter((method) => method.kind !== "constructor").length,
    0,
  );
  return facts.functions.length + methods;
}

function dependencyCount(facts: Facts): number {
  const counts = facts.classes.map(
    (cls) => cls.constructorParameters.filter((parameter) => parameter.countsAsDependency).length,
  );
  return counts.reduce((max, count) => Math.max(max, count), 0);
}

function cyclomaticComplexity(facts: Facts): number {
  let total = 0;
  for (const fn of facts.functions) total += fn.cyclomaticComplexity;
  for (const cls of facts.classes) {
    for (const method of cls.methods) total += method.cyclomaticComplexity;
  }
  for (const statement of facts.looseStatements) total += statement.cyclomatic;
  return total;
}

function inheritanceDepth(classes: ClassFact[]): number {
  const byName = new Map(classes.map((cls) => [cls.name, cls]));
  const memo = new Map<string, number>();

  function depth(name: string, seen: Set<string>): number {
    const cached = memo.get(name);
    if (cached !== undefined && !seen.has(name)) return cached;
    const cls = byName.get(name);
    if (!cls?.extends || seen.has(name)) return 0;
    seen.add(name);
    const value = byName.has(cls.extends.name) ? 1 + depth(cls.extends.name, seen) : 1;
    memo.set(name, value);
    return value;
  }

  let max = 0;
  for (const cls of classes) {
    if (cls.extends) max = Math.max(max, depth(cls.name, new Set()));
  }
  return max;
}

function singleUseAbstractions(facts: Facts): number {
  const counts = new Map<string, number>();
  for (const reference of facts.references) {
    counts.set(reference.name, (counts.get(reference.name) ?? 0) + 1);
  }
  const names = [...facts.interfaces, ...facts.classes, ...facts.functions].map((item) => item.name);
  return names.filter((name) => counts.get(name) === 1).length;
}

export function longestCallChain(facts: Facts, forwardOnly: boolean): { depth: number; start?: string } {
  const bodies = new Map<string, BodyKind>();
  for (const fn of facts.functions) bodies.set(fn.name, fn.body);
  for (const cls of facts.classes) {
    for (const method of cls.methods) bodies.set(`${cls.name}.${method.name}`, method.body);
  }

  const edges = new Map<string, Set<string>>();
  for (const call of facts.callSites) {
    if (!call.localTarget || call.localTarget === call.caller) continue;
    if (!bodies.has(call.caller) || !bodies.has(call.localTarget)) continue;
    if (forwardOnly && bodies.get(call.caller) !== "forward-call") continue;
    const targets = edges.get(call.caller) ?? new Set<string>();
    targets.add(call.localTarget);
    edges.set(call.caller, targets);
  }

  let max = 0;
  let start: string | undefined;
  const visiting = new Set<string>();
  const memo = new Map<string, number>();

  function depth(node: string): number {
    const cached = memo.get(node);
    if (cached !== undefined) return cached;
    if (visiting.has(node)) return 0;
    visiting.add(node);
    let best = 0;
    for (const next of edges.get(node) ?? []) best = Math.max(best, 1 + depth(next));
    visiting.delete(node);
    memo.set(node, best);
    return best;
  }

  for (const node of edges.keys()) {
    const value = depth(node);
    if (value > max) {
      max = value;
      start = node;
    }
  }
  return start === undefined ? { depth: max } : { depth: max, start };
}

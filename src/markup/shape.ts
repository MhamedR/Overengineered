import type { ElementFact, MarkupFacts, MarkupMetrics, StyleRuleFact, VariableFact } from "./types";

const GENERIC_CONTAINERS = new Set(["div", "span"]);
const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
const MATCHING_PSEUDO_CLASSES = new Set(["is", "not", "has", "matches", "-webkit-any", "-moz-any"]);

export const LONG_SELECTOR_COMPOUNDS = 5;
export const DUPLICATE_MIN_DECLARATIONS = 3;

export type Specificity = [ids: number, classes: number, types: number];

export interface SelectorShape {
  selector: string;
  compounds: number;
  specificity: Specificity;
}

export interface WrapperChain {
  /** Wrapper indices from the outermost to the innermost. */
  wrappers: number[];
  /** Index of the element the chain wraps. */
  inner: number;
}

export interface VariableChain {
  /** Variable names from the first alias to the value the chain ends on. */
  names: string[];
  /** Number of variables that only pass along another variable. */
  hops: number;
}

export interface DuplicateGroup {
  rules: StyleRuleFact[];
  declarations: number;
}

export function childrenOf(facts: MarkupFacts): number[][] {
  const children = facts.elements.map((): number[] => []);
  facts.elements.forEach((element, index) => {
    if (element.parent >= 0) children[element.parent]?.push(index);
  });
  return children;
}

/** A `div` or `span` with no attributes and no text of its own. */
export function isBareContainer(element: ElementFact): boolean {
  const tag = element.tag === element.tag.toUpperCase() ? element.tag.toLowerCase() : element.tag;
  return GENERIC_CONTAINERS.has(tag) && element.attributes === 0 && !element.ownText;
}

export function wrapperChains(facts: MarkupFacts): WrapperChain[] {
  const children = childrenOf(facts);
  const wraps = (index: number) => {
    const element = facts.elements[index];
    return element !== undefined && isBareContainer(element) && children[index]?.length === 1;
  };
  const chains: WrapperChain[] = [];
  facts.elements.forEach((element, index) => {
    if (!wraps(index) || (element.parent >= 0 && wraps(element.parent))) return;
    const wrappers: number[] = [];
    let current = index;
    while (wraps(current)) {
      wrappers.push(current);
      current = children[current]?.[0] ?? -1;
    }
    if (current >= 0) chains.push({ wrappers, inner: current });
  });
  return chains;
}

export function elementPath(facts: MarkupFacts, indices: number[]): string {
  return indices.map((index) => facts.elements[index]?.tag ?? "?").join(" > ");
}

export function deepestElement(facts: MarkupFacts): number {
  let deepest = -1;
  facts.elements.forEach((element, index) => {
    if (deepest === -1 || element.depth > (facts.elements[deepest]?.depth ?? 0)) deepest = index;
  });
  return deepest;
}

export function ancestorsOf(facts: MarkupFacts, index: number): number[] {
  const ancestors: number[] = [];
  let current = facts.elements[index]?.parent ?? -1;
  while (current >= 0) {
    ancestors.unshift(current);
    current = facts.elements[current]?.parent ?? -1;
  }
  return ancestors;
}

export function selectorShape(selector: string): SelectorShape {
  const compounds = splitTopLevel(selector, (char) => /\s/.test(char) || char === ">" || char === "+" || char === "~");
  const specificity = compounds.reduce<Specificity>((total, compound) => add(total, compoundSpecificity(compound)), [0, 0, 0]);
  return { selector, compounds: compounds.length, specificity };
}

/** Selectors with SCSS or Less interpolation are left out because their final text is unknown. */
export function measurableSelectors(rules: StyleRuleFact[]): SelectorShape[] {
  const seen = new Set<string>();
  const shapes: SelectorShape[] = [];
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      if (seen.has(selector) || selector.includes("#{") || selector.includes("@{")) continue;
      seen.add(selector);
      shapes.push(selectorShape(selector));
    }
  }
  return shapes;
}

export function isOverSpecific(shape: SelectorShape): boolean {
  const [ids, classes, types] = shape.specificity;
  return shape.compounds >= LONG_SELECTOR_COMPOUNDS || ids >= 2 || (ids >= 1 && classes + types >= 2);
}

export function compareSpecificity(left: Specificity, right: Specificity): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function formatSpecificity(specificity: Specificity): string {
  return specificity.join(",");
}

/** A rule whose every selector is one class and whose every declaration is `!important`, as in utility classes. */
export function isUtilityRule(rule: StyleRuleFact): boolean {
  return (
    rule.declarations.length > 0 &&
    rule.declarations.every((declaration) => declaration.important) &&
    rule.selectors.every((selector) => /^\.(?:[\w-]|\\.)+$/.test(selector))
  );
}

export function importantCounts(facts: MarkupFacts): { total: number; important: number; utility: number } {
  let total = 0;
  let important = 0;
  let utility = 0;
  for (const rule of facts.rules) {
    total += rule.declarations.length;
    const count = rule.declarations.filter((declaration) => declaration.important).length;
    if (isUtilityRule(rule)) utility += count;
    else important += count;
  }
  return { total, important, utility };
}

export function duplicateGroups(facts: MarkupFacts): DuplicateGroup[] {
  const groups = new Map<string, StyleRuleFact[]>();
  for (const rule of facts.rules) {
    if (rule.declarations.length < DUPLICATE_MIN_DECLARATIONS) continue;
    const block = rule.declarations
      .map((declaration) => `${declaration.property}:${declaration.value}${declaration.important ? "!" : ""}`)
      .sort()
      .join(";");
    const key = `${rule.context}|${block}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  return [...groups.values()]
    .filter((rules) => rules.length >= 2)
    .map((rules) => ({ rules, declarations: rules[0]?.declarations.length ?? 0 }));
}

export function variableChains(facts: MarkupFacts): VariableChain[] {
  const definitions = new Map<string, VariableFact[]>();
  for (const variable of facts.variables) definitions.set(variable.name, [...(definitions.get(variable.name) ?? []), variable]);

  const forwardsTo = (name: string): string | undefined => {
    const defined = definitions.get(name);
    if (!defined || defined.length !== 1) return undefined;
    return aliasTarget(defined[0]?.value ?? "");
  };
  const targeted = new Set<string>();
  for (const name of definitions.keys()) {
    const target = forwardsTo(name);
    if (target) targeted.add(target);
  }

  const chains: VariableChain[] = [];
  for (const name of definitions.keys()) {
    if (!forwardsTo(name) || targeted.has(name)) continue;
    const names = [name];
    const visited = new Set([name]);
    let target = forwardsTo(name);
    while (target && !visited.has(target)) {
      names.push(target);
      visited.add(target);
      target = forwardsTo(target);
    }
    chains.push({ names, hops: names.filter((item) => forwardsTo(item) !== undefined).length });
  }
  return chains;
}

/** The variable a value passes along unchanged, such as `var(--b)`, `$b`, or `@b`. */
export function aliasTarget(value: string): string | undefined {
  const trimmed = value.trim();
  const custom = /^var\(\s*(--[\w-]+)\s*\)$/.exec(trimmed);
  if (custom) return custom[1];
  if (/^\$[\w-]+$/.test(trimmed) || /^@[\w-]+$/.test(trimmed)) return trimmed;
  return undefined;
}

export function markupMetrics(facts: MarkupFacts): MarkupMetrics {
  const shapes = measurableSelectors(facts.rules);
  const highest = shapes.reduce<SelectorShape | undefined>(
    (best, shape) => (!best || compareSpecificity(shape.specificity, best.specificity) > 0 ? shape : best),
    undefined,
  );
  const deepest = facts.elements[deepestElement(facts)];
  const counts = importantCounts(facts);
  return {
    linesOfCode: facts.linesOfCode,
    elements: facts.elements.length,
    maxDepth: deepest?.depth ?? 0,
    bareWrappers: facts.elements.filter(isBareContainer).length,
    longestWrapperChain: Math.max(0, ...wrapperChains(facts).map((chain) => chain.wrappers.length)),
    rules: facts.rules.length,
    declarations: counts.total,
    importantDeclarations: counts.important + counts.utility,
    longestSelector: Math.max(0, ...shapes.map((shape) => shape.compounds)),
    highestSpecificity: formatSpecificity(highest?.specificity ?? [0, 0, 0]),
    variables: new Set(facts.variables.map((variable) => variable.name)).size,
    longestVariableChain: Math.max(0, ...variableChains(facts).map((chain) => chain.hops)),
    duplicateBlocks: duplicateGroups(facts).length,
  };
}

function compoundSpecificity(compound: string): Specificity {
  const result: Specificity = [0, 0, 0];
  let i = 0;
  while (i < compound.length) {
    const char = compound[i] ?? "";
    if (char === "#") {
      result[0] += 1;
      i = skipIdentifier(compound, i + 1);
    } else if (char === "." || char === "%") {
      result[1] += 1;
      i = skipIdentifier(compound, i + 1);
    } else if (char === "[") {
      result[1] += 1;
      i = skipGroup(compound, i, "[", "]");
    } else if (char === ":") {
      i = pseudoSpecificity(compound, i, result);
    } else if (/[A-Za-z_\\-]/.test(char) || char.charCodeAt(0) > 127) {
      result[2] += 1;
      i = skipIdentifier(compound, i);
    } else {
      i += 1;
    }
  }
  return result;
}

function pseudoSpecificity(compound: string, start: number, result: Specificity): number {
  const element = compound[start + 1] === ":";
  const nameStart = start + (element ? 2 : 1);
  const nameEnd = skipIdentifier(compound, nameStart);
  const name = compound.slice(nameStart, nameEnd).toLowerCase();
  let end = nameEnd;
  let argument: string | undefined;
  if (compound[nameEnd] === "(") {
    end = skipGroup(compound, nameEnd, "(", ")");
    argument = compound.slice(nameEnd + 1, end - 1);
  }
  if (element || LEGACY_PSEUDO_ELEMENTS.has(name)) {
    result[2] += 1;
  } else if (name === "where") {
    // :where() adds no specificity.
  } else if (MATCHING_PSEUDO_CLASSES.has(name) && argument !== undefined) {
    const strongest = splitTopLevel(argument, (char) => char === ",")
      .map((part) => selectorShape(part.trim()).specificity)
      .reduce<Specificity>((best, item) => (compareSpecificity(item, best) > 0 ? item : best), [0, 0, 0]);
    result[0] += strongest[0];
    result[1] += strongest[1];
    result[2] += strongest[2];
  } else {
    result[1] += 1;
  }
  return end;
}

function skipIdentifier(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const char = text[i] ?? "";
    if (char === "\\") i += 2;
    else if (/[\w-]/.test(char) || char.charCodeAt(0) > 127) i += 1;
    else break;
  }
  return i;
}

function skipGroup(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote = "";
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function splitTopLevel(text: string, isSeparator: (char: string) => boolean): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (const char of text) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (depth === 0 && isSeparator(char)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function add(left: Specificity, right: Specificity): Specificity {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

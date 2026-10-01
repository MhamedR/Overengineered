import { Parser } from "htmlparser2";
import postcss, { type AtRule, type ChildNode, type Container, type Declaration, type Root, type Rule } from "postcss";
import less from "postcss-less";
import scss from "postcss-scss";
import type { MarkupLanguage } from "../commands";
import type { Span } from "../types";
import type { DeclarationFact, ElementFact, MarkupFacts, StyleRuleFact, StyleSyntax, VariableFact } from "./types";

const TRANSPARENT_TAGS = new Set(["html", "body"]);
const SKIPPED_SUBTREES = new Set(["svg", "math"]);
const CONDITIONAL_AT_RULES = new Set(["media", "supports", "container", "layer", "document", "scope"]);
const SCSS_FLOW_AT_RULES = new Set(["include", "if", "else", "each", "for", "while", "at-root"]);
const MAX_RESOLVED_SELECTORS = 64;

export function extractMarkupFacts(text: string, fileName: string, language: MarkupLanguage): MarkupFacts {
  const facts: MarkupFacts = {
    fileName,
    language,
    linesOfCode: nonBlankLines(text),
    elements: [],
    rules: [],
    variables: [],
  };
  if (language === "css" || language === "scss" || language === "less") {
    collectStyles(facts, text, language, 0);
  } else {
    collectMarkup(facts, text, language);
  }
  return facts;
}

export function filterMarkupFacts(facts: MarkupFacts, text: string, range: Span): MarkupFacts {
  const inside = (span: Span) => span.start >= range.start && span.end <= range.end;
  const remap = new Map<number, number>();
  const elements: ElementFact[] = [];
  facts.elements.forEach((element, index) => {
    if (!inside(element.span)) return;
    remap.set(index, elements.length);
    elements.push({ ...element, parent: remap.get(element.parent) ?? -1 });
  });
  return {
    ...facts,
    linesOfCode: nonBlankLines(text.slice(range.start, range.end)),
    elements,
    rules: facts.rules.filter((rule) => inside(rule.span)),
    variables: facts.variables.filter((variable) => inside(variable.span)),
  };
}

function nonBlankLines(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

interface OpenElement {
  index: number;
  skipped: boolean;
  transparent: boolean;
}

function collectMarkup(facts: MarkupFacts, text: string, language: MarkupLanguage): void {
  const stack: OpenElement[] = [];
  let style: { syntax: StyleSyntax | undefined; start: number; text: string } | undefined;

  const parentIndex = (): number => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const entry = stack[i];
      if (entry && !entry.transparent) return entry.index;
    }
    return -1;
  };
  const insideSkipped = () => stack.some((entry) => entry.skipped);

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const lower = name.toLowerCase();
        if (lower === "style") {
          style = { syntax: styleSyntax(attributes["lang"]), start: -1, text: "" };
          stack.push({ index: -1, skipped: true, transparent: true });
          return;
        }
        if (lower === "script" || lower === "head") {
          stack.push({ index: -1, skipped: true, transparent: true });
          return;
        }
        const rootTemplate = language === "vue" && lower === "template" && stack.length === 0;
        if (insideSkipped() || TRANSPARENT_TAGS.has(lower) || rootTemplate) {
          stack.push({ index: -1, skipped: insideSkipped(), transparent: true });
          return;
        }
        const parent = parentIndex();
        const depth = parent === -1 ? 1 : (facts.elements[parent]?.depth ?? 0) + 1;
        facts.elements.push({
          tag: name,
          depth,
          parent,
          attributes: Object.keys(attributes).length,
          ownText: false,
          span: { start: parser.startIndex, end: parser.endIndex + 1 },
        });
        stack.push({ index: facts.elements.length - 1, skipped: SKIPPED_SUBTREES.has(lower), transparent: false });
      },
      ontext(chunk) {
        if (style) {
          if (style.start === -1) style.start = parser.startIndex;
          style.text += chunk;
          return;
        }
        if (insideSkipped() || chunk.trim().length === 0) return;
        const owner = facts.elements[parentIndex()];
        if (owner) owner.ownText = true;
      },
      onclosetag(name) {
        const entry = stack.pop();
        if (name.toLowerCase() === "style" && style) {
          if (style.syntax && style.start !== -1) collectEmbeddedStyles(facts, style.text, style.syntax, style.start);
          style = undefined;
        }
        const element = entry && entry.index >= 0 ? facts.elements[entry.index] : undefined;
        if (element) element.span = { start: element.span.start, end: parser.endIndex + 1 };
      },
    },
    { lowerCaseTags: false, lowerCaseAttributeNames: false, recognizeSelfClosing: language !== "html" },
  );
  parser.write(text);
  parser.end();
}

function styleSyntax(lang: string | undefined): StyleSyntax | undefined {
  if (lang === undefined || lang === "" || lang === "css" || lang === "postcss") return "css";
  if (lang === "scss") return "scss";
  if (lang === "less") return "less";
  return undefined;
}

function collectEmbeddedStyles(facts: MarkupFacts, text: string, syntax: StyleSyntax, offset: number): void {
  try {
    collectStyles(facts, text, syntax, offset);
  } catch {
    // An embedded block that fails to parse is left out so the rest of the file can still be read.
  }
}

function collectStyles(facts: MarkupFacts, text: string, syntax: StyleSyntax, offset: number): void {
  const parse = syntax === "scss" ? scss.parse : syntax === "less" ? less.parse : postcss.parse;
  const root = parse(text) as Root;
  walkContainer(root, [], [], { facts, syntax, offset });
}

interface StyleWalk {
  facts: MarkupFacts;
  syntax: StyleSyntax;
  offset: number;
}

function walkContainer(container: Container, parents: string[], context: string[], walk: StyleWalk): void {
  for (const node of container.nodes ?? []) walkNode(node, parents, context, walk);
}

function walkNode(node: ChildNode, parents: string[], context: string[], walk: StyleWalk): void {
  if (node.type === "decl") {
    if (isVariableDeclaration(node, walk.syntax)) walk.facts.variables.push(variableFact(node.prop, node.value, node, walk));
    return;
  }
  if (node.type === "atrule") {
    walkAtRule(node, parents, context, walk);
    return;
  }
  if (node.type !== "rule") return;
  if (walk.syntax === "less" && isLessMixinDefinition(node.selector)) return;

  const selectors = resolveSelectors(parents, node.selectors);
  pushRule(node, selectors, context, walk);
  walkNested(node, selectors, context, walk);
}

function pushRule(node: Rule | AtRule, selectors: string[], context: string[], walk: StyleWalk): void {
  const declarations: DeclarationFact[] = [];
  for (const child of node.nodes ?? []) {
    if (child.type !== "decl" || child.prop.startsWith("$")) continue;
    if (child.prop.startsWith("--")) walk.facts.variables.push(variableFact(child.prop, child.value, child, walk));
    declarations.push({
      property: child.prop.toLowerCase(),
      value: child.value.replace(/\s+/g, " ").trim(),
      important: child.important === true,
      span: spanOf(child, walk),
    });
  }
  if (node.type === "atrule" && declarations.length === 0) return;
  const rule: StyleRuleFact = { selectors, context: context.join(" "), declarations, syntax: walk.syntax, span: spanOf(node, walk) };
  walk.facts.rules.push(rule);
}

function walkNested(node: Rule | AtRule, selectors: string[], context: string[], walk: StyleWalk): void {
  for (const child of node.nodes ?? []) {
    if (child.type === "decl" && child.prop.startsWith("$")) walkNode(child, selectors, context, walk);
    if (child.type === "rule" || child.type === "atrule") walkNode(child, selectors, context, walk);
  }
}

function walkAtRule(node: AtRule, parents: string[], context: string[], walk: StyleWalk): void {
  const lessVariable = node as AtRule & { variable?: boolean; value?: string };
  if (walk.syntax === "less" && lessVariable.variable === true) {
    walk.facts.variables.push(variableFact(`@${node.name}`, lessVariable.value ?? "", node, walk));
    return;
  }
  const name = node.name.toLowerCase();
  if (CONDITIONAL_AT_RULES.has(name)) {
    const inner = [...context, `@${name} ${node.params}`.trim()];
    if (parents.length > 0) {
      pushRule(node, parents, inner, walk);
      walkNested(node, parents, inner, walk);
    } else {
      walkContainer(node, parents, inner, walk);
    }
    return;
  }
  if (walk.syntax === "scss" && SCSS_FLOW_AT_RULES.has(name)) walkContainer(node, parents, context, walk);
}

function isVariableDeclaration(node: Declaration, syntax: StyleSyntax): boolean {
  return syntax === "scss" && node.prop.startsWith("$");
}

function isLessMixinDefinition(selector: string): boolean {
  return /^[.#][\w-]+\s*\(.*\)\s*(when\b.*)?$/.test(selector.trim());
}

function resolveSelectors(parents: string[], selectors: string[]): string[] {
  const own = selectors.map((selector) => selector.replace(/\s+/g, " ").trim());
  if (parents.length === 0) return own;
  const resolved: string[] = [];
  for (const parent of parents) {
    for (const selector of own) {
      resolved.push(selector.includes("&") ? selector.replaceAll("&", parent) : `${parent} ${selector}`);
      if (resolved.length >= MAX_RESOLVED_SELECTORS) return resolved;
    }
  }
  return resolved;
}

function variableFact(name: string, value: string, node: ChildNode, walk: StyleWalk): VariableFact {
  return { name, value: value.replace(/\s+/g, " ").trim(), span: spanOf(node, walk) };
}

function spanOf(node: Rule | Declaration | ChildNode, walk: StyleWalk): Span {
  const start = node.source?.start?.offset ?? 0;
  const end = node.source?.end?.offset ?? start;
  return { start: walk.offset + start, end: walk.offset + Math.max(start, end) };
}

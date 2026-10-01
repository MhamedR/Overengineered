import type { MarkupLanguage } from "../commands";
import type { Span } from "../types";

export type StyleSyntax = "css" | "scss" | "less";

export interface ElementFact {
  /** Tag name with its original casing, so components such as `MyCard` stay distinct from `div`. */
  tag: string;
  /** Nesting level, starting at 1 for top-level content. `html`, `body`, and a Vue root `template` do not count. */
  depth: number;
  /** Index of the parent element in `MarkupFacts.elements`, or -1 at the top. */
  parent: number;
  attributes: number;
  /** True when the element has non-blank text of its own, including template expressions. */
  ownText: boolean;
  span: Span;
}

export interface DeclarationFact {
  property: string;
  value: string;
  important: boolean;
  span: Span;
}

export interface StyleRuleFact {
  /** Selectors with SCSS and Less nesting resolved against their parents. */
  selectors: string[];
  /** Enclosing at-rules such as `@media (min-width: 40em)`, joined with spaces. */
  context: string;
  declarations: DeclarationFact[];
  syntax: StyleSyntax;
  span: Span;
}

export interface VariableFact {
  /** Full name including its sigil: `--color`, `$color`, or `@color`. */
  name: string;
  value: string;
  span: Span;
}

export interface MarkupFacts {
  fileName: string;
  language: MarkupLanguage;
  linesOfCode: number;
  elements: ElementFact[];
  rules: StyleRuleFact[];
  variables: VariableFact[];
}

export interface MarkupMetrics {
  linesOfCode: number;
  elements: number;
  maxDepth: number;
  bareWrappers: number;
  longestWrapperChain: number;
  rules: number;
  declarations: number;
  importantDeclarations: number;
  longestSelector: number;
  highestSpecificity: string;
  variables: number;
  longestVariableChain: number;
  duplicateBlocks: number;
}

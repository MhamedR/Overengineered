export type SourceLanguage = "typescript" | "javascript";

export type BodyKind =
  | "empty"
  | "forward-call"
  | "transformed-call"
  | "return-identifier"
  | "return-new"
  | "other";

export type CallKind = "bare" | "this-method" | "other";

export interface Span {
  start: number;
  end: number;
}

export interface HeritageRef {
  name: string;
  typeArguments: string[];
}

export interface ParameterFact {
  name: string;
  typeText?: string;
  /** True when the parameter is a typed service-like dependency. */
  countsAsDependency: boolean;
  parameterProperty: boolean;
}

export interface CallableFact {
  name: string;
  params: ParameterFact[];
  typeParameters: string[];
  body: BodyKind;
  callee?: string;
  behavioralStatements: number;
  structuralStatements: number;
  cyclomaticComplexity: number;
  span: Span;
  exported: boolean;
}

export interface MethodFact extends CallableFact {
  kind: "method" | "constructor" | "getter" | "setter";
}

export interface FunctionFact extends CallableFact {}

export interface InterfaceFact {
  name: string;
  typeParameters: string[];
  members: string[];
  extends: HeritageRef[];
  span: Span;
  exported: boolean;
}

export interface ClassFact {
  name: string;
  typeParameters: string[];
  implements: HeritageRef[];
  extends?: HeritageRef;
  abstract: boolean;
  decorators: string[];
  constructorParameters: ParameterFact[];
  methods: MethodFact[];
  span: Span;
  exported: boolean;
}

export interface TypeAliasFact {
  name: string;
  typeParameters: string[];
  span: Span;
  exported: boolean;
}

export interface CallSiteFact {
  caller: string;
  callee: string;
  calleeName: string;
  kind: CallKind;
  /** Set when the callee resolves to a function or method in this file. */
  localTarget?: string;
  span: Span;
}

export interface ConstructionFact {
  caller: string;
  typeName: string;
  span: Span;
}

export interface InstantiationFact {
  name: string;
  typeArguments: string[];
  span: Span;
}

export interface ReferenceFact {
  name: string;
  span: Span;
  inTypePosition: boolean;
}

export interface LooseStatement {
  span: Span;
  behavioral: number;
  structural: number;
  cyclomatic: number;
}

export interface Facts {
  fileName: string;
  language: SourceLanguage;
  linesOfCode: number;
  interfaces: InterfaceFact[];
  classes: ClassFact[];
  functions: FunctionFact[];
  typeAliases: TypeAliasFact[];
  callSites: CallSiteFact[];
  constructions: ConstructionFact[];
  instantiations: InstantiationFact[];
  references: ReferenceFact[];
  moduleStatements: Span[];
  looseStatements: LooseStatement[];
  structuralStatements: number;
  behavioralStatements: number;
}

export type SignalType =
  | "single-implementation-interface"
  | "single-use-abstraction"
  | "delegation-only"
  | "single-product-factory"
  | "single-strategy"
  | "high-dependency-count"
  | "deep-indirection"
  | "file-fragmentation"
  | "unused-genericity"
  | "excessive-boilerplate"
  | "wrapper-chain"
  | "deep-nesting"
  | "variable-chain"
  | "selector-specificity"
  | "important-overuse"
  | "duplicate-declarations";

export type Severity = "info" | "low" | "medium" | "high";

export interface SignalLocation {
  fileName: string;
  name: string;
  start: number;
  end: number;
}

export interface Signal {
  type: SignalType;
  severity: Severity;
  confidence: number;
  title: string;
  evidence: string[];
  interpretation: string;
  legitimateReasons: string[];
  questions: string[];
  locations: SignalLocation[];
  clusterId: string;
}

export interface CodeMetrics {
  linesOfCode: number;
  functions: number;
  classes: number;
  interfaces: number;
  abstractions: number;
  /** Highest count of typed constructor dependencies in the analyzed scope. */
  dependencyCount: number;
  inheritanceDepth: number;
  /** Longest local call chain, measured in edges. */
  callDepth: number;
  cyclomaticComplexity: number;
  filesTouched: number;
  /** Longest chain of calls whose caller only forwards arguments. */
  indirectionLayers: number;
  singleUseAbstractions: number;
  behavioralStatements: number;
  structuralStatements: number;
}

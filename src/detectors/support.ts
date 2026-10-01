import type { ClassFact, Facts, Severity, Signal, SignalLocation, Span } from "../types";
import type { AnalysisSettings, DetectorInput, ProjectContext } from "./types";

export const defaultAnalysisSettings: AnalysisSettings = {
  singleImplementationSeverity: "medium",
  maxDependencyCount: 5,
  maxCallDepth: 4,
  maxNestingDepth: 12,
};

const OUTSIDE_SCOPE = "Other implementations may exist outside the analyzed code.";

const severityOrder: Severity[] = ["info", "low", "medium", "high"];

export function singleImplementationSeverity(value: unknown): Severity {
  if (value === "info" || value === "low" || value === "medium" || value === "high") return value;
  return "medium";
}

export function boundedInt(value: unknown, fallback: number, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

export function soften(severity: Severity): Severity {
  const index = severityOrder.indexOf(severity);
  return severityOrder[Math.max(0, index - 1)] ?? "info";
}

export function reviewConfidence(base: number, input: Pick<DetectorInput, "context" | "scope">): number {
  if (!input.context.partial) return base;
  const cap = input.scope === "file" ? 0.45 : 0.4;
  return Math.min(base, cap);
}

export function fileOnlyContext(): ProjectContext {
  return { partial: true };
}

export function implementersOf(facts: Facts, interfaceName: string): ClassFact[] {
  return facts.classes.filter((cls) => cls.implements.some((ref) => ref.name === interfaceName));
}

export function hasExternalImplementer(facts: Facts, interfaceName: string, context: ProjectContext): boolean {
  const localNames = new Set(implementersOf(facts, interfaceName).map((cls) => cls.name));
  return (context.externalImplementers?.get(interfaceName) ?? []).some((name) => !localNames.has(name));
}

export function referenceTotal(name: string, localCount: number, context: ProjectContext): number {
  return localCount + (context.additionalReferences?.get(name) ?? 0);
}

export function isIgnoredSource(fileName: string): boolean {
  const base = fileName.split(/[/\\]/).at(-1) ?? fileName;
  return /\.d\.ts$/.test(base) || /\.generated\.[cm]?[jt]sx?$/.test(base) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(base);
}

export function isComponentFile(fileName: string): boolean {
  return /\.(tsx|jsx)$/.test(fileName);
}

export function isPublicEntry(fileName: string): boolean {
  const base = fileName.split(/[/\\]/).at(-1) ?? fileName;
  return /^index\.[cm]?[jt]sx?$/.test(base);
}

export function inPortsDirectory(fileName: string): boolean {
  return fileName.split(/[/\\]/).includes("ports");
}

export function hasFrameworkDecorator(cls: ClassFact): boolean {
  return cls.decorators.some((name) =>
    ["Injectable", "Component", "Controller", "Directive", "Pipe", "Module", "Service"].includes(name),
  );
}

export function location(facts: Facts, name: string, span: Span): SignalLocation {
  return { fileName: facts.fileName, name, start: span.start, end: span.end };
}

export function withReviewContext(
  input: DetectorInput,
  signal: Omit<Signal, "confidence" | "legitimateReasons"> & { confidence: number; legitimateReasons: string[] },
): Signal {
  const legitimateReasons = input.context.partial
    ? [OUTSIDE_SCOPE, ...signal.legitimateReasons.filter((reason) => reason !== OUTSIDE_SCOPE)]
    : signal.legitimateReasons.filter((reason) => reason !== OUTSIDE_SCOPE);
  return {
    ...signal,
    confidence: reviewConfidence(signal.confidence, input),
    legitimateReasons,
  };
}

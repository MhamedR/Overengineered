import type { AnalysisScope } from "./commands";
import { detectSignals } from "./detectors";
import { defaultAnalysisSettings, fileOnlyContext } from "./detectors/support";
import type { AnalysisSettings, ProjectContext } from "./detectors/types";
import { deriveMetrics } from "./metrics";
import { enclosingCallableSpan, extractFacts, filterFacts } from "./parse/extract";
import { buildProjectContext, type ProjectFile } from "./projectContext";
import { scoreSignals, type ConcernBand } from "./score";
import type { CodeMetrics, Facts, Signal, SourceLanguage } from "./types";

export const MAX_CACHED_FILES = 20;

export interface AnalyzeInput {
  uri: string;
  version: number;
  fileName: string;
  languageId: string;
  text: string;
  scope: AnalysisScope;
  start: number;
  end: number;
  position: number;
  settings?: AnalysisSettings;
  projectFiles?: ProjectFile[];
  projectIncomplete?: boolean;
}

export interface AnalysisSnapshot {
  kind: "code";
  language: SourceLanguage;
  scope: AnalysisScope;
  facts: Facts;
  metrics: CodeMetrics;
  signals: Signal[];
  score: number;
  band: ConcernBand;
  confidence: number;
  contextPartial: boolean;
  limits: Pick<AnalysisSettings, "maxDependencyCount" | "maxCallDepth">;
}

export type AnalyzeResult = { ok: true; snapshot: AnalysisSnapshot } | { ok: false; message: string };

const cache = new Map<string, { version: number; text: string; facts: Facts }>();

export function clearFactsCache(): void {
  cache.clear();
}

export function analyzeText(input: AnalyzeInput): AnalyzeResult {
  const facts = factsForDocument(input);
  const settings = input.settings ?? defaultAnalysisSettings;
  if (input.scope === "function") {
    const span = enclosingCallableSpan(facts, input.position);
    if (!span) return { ok: false, message: "Place the cursor inside a function or method." };
    const scoped = filterFacts(facts, input.text, span);
    return snapshot("function", scoped, settings, contextFor(scoped, input));
  }
  if (input.scope === "selection") {
    const scoped = filterFacts(facts, input.text, { start: input.start, end: input.end });
    return snapshot("selection", scoped, settings, contextFor(scoped, input));
  }
  return snapshot("file", facts, settings, contextFor(facts, input));
}

function contextFor(facts: Facts, input: AnalyzeInput): ProjectContext {
  if (!input.projectFiles) return fileOnlyContext();
  return buildProjectContext(facts, input.projectFiles, { incomplete: input.projectIncomplete === true });
}

function snapshot(scope: AnalysisScope, facts: Facts, settings: AnalysisSettings, context: ProjectContext): AnalyzeResult {
  const signals = detectSignals({
    facts,
    context,
    settings,
    scope,
  });
  const estimate = scoreSignals(signals, context.partial);
  return {
    ok: true,
    snapshot: {
      kind: "code",
      language: facts.language,
      scope,
      facts,
      metrics: deriveMetrics(facts),
      signals,
      score: estimate.score,
      band: estimate.band,
      confidence: estimate.confidence,
      contextPartial: context.partial,
      limits: { maxDependencyCount: settings.maxDependencyCount, maxCallDepth: settings.maxCallDepth },
    },
  };
}

function factsForDocument(input: AnalyzeInput): Facts {
  const cached = cache.get(input.uri);
  if (cached && cached.version === input.version && cached.text === input.text) return cached.facts;

  const facts = extractFacts(input.text, input.fileName, input.languageId);
  cache.delete(input.uri);
  if (cache.size >= MAX_CACHED_FILES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(input.uri, { version: input.version, text: input.text, facts });
  return facts;
}

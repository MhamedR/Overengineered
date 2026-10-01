import type { AnalysisScope, MarkupLanguage } from "../commands";
import { defaultAnalysisSettings } from "../detectors/support";
import type { AnalysisSettings } from "../detectors/types";
import { scoreSignals, type ConcernBand } from "../score";
import type { Signal } from "../types";
import { detectMarkupSignals } from "./detectors";
import { extractMarkupFacts, filterMarkupFacts } from "./extract";
import { markupMetrics } from "./shape";
import type { MarkupFacts, MarkupMetrics } from "./types";

export interface MarkupAnalyzeInput {
  fileName: string;
  languageId: MarkupLanguage;
  text: string;
  scope: AnalysisScope;
  start: number;
  end: number;
  settings?: AnalysisSettings;
}

export interface MarkupSnapshot {
  kind: "markup";
  language: MarkupLanguage;
  scope: AnalysisScope;
  facts: MarkupFacts;
  metrics: MarkupMetrics;
  signals: Signal[];
  score: number;
  band: ConcernBand;
  confidence: number;
  contextPartial: boolean;
  limits: Pick<AnalysisSettings, "maxNestingDepth">;
}

export type MarkupAnalyzeResult = { ok: true; snapshot: MarkupSnapshot } | { ok: false; message: string };

export function analyzeMarkup(input: MarkupAnalyzeInput): MarkupAnalyzeResult {
  if (input.scope === "function") {
    return { ok: false, message: "Analyze Function works in TypeScript and JavaScript. Use Analyze File or Analyze Selection here." };
  }
  const settings = input.settings ?? defaultAnalysisSettings;
  const all = extractMarkupFacts(input.text, input.fileName, input.languageId);
  const facts = input.scope === "selection" ? filterMarkupFacts(all, input.text, { start: input.start, end: input.end }) : all;
  const signals = detectMarkupSignals({ facts, settings, scope: input.scope });
  const estimate = scoreSignals(signals, false);
  return {
    ok: true,
    snapshot: {
      kind: "markup",
      language: input.languageId,
      scope: input.scope,
      facts,
      metrics: markupMetrics(facts),
      signals,
      score: estimate.score,
      band: estimate.band,
      confidence: estimate.confidence,
      contextPartial: false,
      limits: { maxNestingDepth: settings.maxNestingDepth },
    },
  };
}

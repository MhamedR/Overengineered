import type { AnalysisScope } from "../../commands";
import type { AnalysisSettings } from "../../detectors/types";
import type { Signal, SignalLocation, Span } from "../../types";
import type { MarkupFacts } from "../types";

export interface MarkupDetectorInput {
  facts: MarkupFacts;
  settings: AnalysisSettings;
  scope: AnalysisScope;
}

export interface MarkupDetector {
  id: string;
  detect(input: MarkupDetectorInput): Signal[];
}

export const MAX_LOCATIONS = 5;

export function markupLocation(facts: MarkupFacts, name: string, span: Span): SignalLocation {
  return { fileName: facts.fileName, name, start: span.start, end: span.end };
}

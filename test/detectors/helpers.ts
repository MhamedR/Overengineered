import { detectSignals } from "../../src/detectors";
import { defaultAnalysisSettings } from "../../src/detectors/support";
import type { AnalysisSettings, ProjectContext } from "../../src/detectors/types";
import type { AnalysisScope } from "../../src/commands";
import { extractFacts } from "../../src/parse/extract";
import type { Signal, SignalType } from "../../src/types";

export function signalsFor(
  source: string,
  options?: {
    fileName?: string;
    settings?: Partial<AnalysisSettings>;
    context?: ProjectContext;
    scope?: AnalysisScope;
  },
): Signal[] {
  const fileName = options?.fileName ?? "sample.ts";
  const facts = extractFacts(source, fileName, languageId(fileName));
  return detectSignals({
    facts,
    context: options?.context ?? { partial: true },
    settings: { ...defaultAnalysisSettings, ...options?.settings },
    scope: options?.scope ?? "file",
  });
}

export function ofType(signals: Signal[], type: SignalType): Signal[] {
  return signals.filter((signal) => signal.type === type);
}

function languageId(fileName: string): string {
  if (fileName.endsWith(".tsx")) return "typescriptreact";
  if (fileName.endsWith(".jsx")) return "javascriptreact";
  if (/\.(js|mjs|cjs)$/.test(fileName)) return "javascript";
  return "typescript";
}

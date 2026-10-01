import type { AnalysisScope, MarkupLanguage } from "../../src/commands";
import { defaultAnalysisSettings } from "../../src/detectors/support";
import type { AnalysisSettings } from "../../src/detectors/types";
import { detectMarkupSignals } from "../../src/markup/detectors";
import { extractMarkupFacts } from "../../src/markup/extract";
import type { Signal, SignalType } from "../../src/types";

export function markupSignals(
  source: string,
  options?: { fileName?: string; settings?: Partial<AnalysisSettings>; scope?: AnalysisScope },
): Signal[] {
  const fileName = options?.fileName ?? "page.html";
  const facts = extractMarkupFacts(source, fileName, languageFor(fileName));
  return detectMarkupSignals({
    facts,
    settings: { ...defaultAnalysisSettings, ...options?.settings },
    scope: options?.scope ?? "file",
  });
}

export function ofType(signals: Signal[], type: SignalType): Signal[] {
  return signals.filter((signal) => signal.type === type);
}

export function languageFor(fileName: string): MarkupLanguage {
  const extension = fileName.split(".").at(-1);
  switch (extension) {
    case "css":
    case "scss":
    case "less":
    case "vue":
    case "svelte":
      return extension;
    default:
      return "html";
  }
}

import type { Signal } from "../../types";
import { deepNestingDetector } from "./deepNesting";
import { duplicateDeclarationsDetector } from "./duplicateDeclarations";
import { importantOveruseDetector } from "./importantOveruse";
import { selectorSpecificityDetector } from "./selectorSpecificity";
import type { MarkupDetector, MarkupDetectorInput } from "./types";
import { variableChainDetector } from "./variableChain";
import { wrapperChainDetector } from "./wrapperChain";

const detectors: MarkupDetector[] = [
  wrapperChainDetector,
  deepNestingDetector,
  variableChainDetector,
  selectorSpecificityDetector,
  importantOveruseDetector,
  duplicateDeclarationsDetector,
];

export function detectMarkupSignals(input: MarkupDetectorInput): Signal[] {
  if (isIgnoredMarkup(input.facts.fileName)) return [];
  const signals = detectors.flatMap((detector) => detector.detect(input));
  signals.sort((left, right) => (left.locations[0]?.start ?? 0) - (right.locations[0]?.start ?? 0) || left.type.localeCompare(right.type));
  return signals;
}

export function isIgnoredMarkup(fileName: string): boolean {
  const base = fileName.split(/[/\\]/).at(-1) ?? fileName;
  const folders = fileName.split(/[/\\]/).slice(0, -1);
  return /\.min\.(css|html)$/.test(base) || /\.generated\./.test(base) || folders.includes("vendor") || folders.includes("node_modules");
}

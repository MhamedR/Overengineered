import type { Facts, Signal } from "../types";
import type { ProjectFileSummary } from "./types";
import { location, withReviewContext } from "./support";
import type { Detector, DetectorInput } from "./types";

const LAYER_SUFFIX = /(Factory|Builder|Strategy|Service|Repository)$/;
const MIN_FILES = 4;
const MIN_SUFFIXES = 3;
const MAX_MEDIAN_BEHAVIOR = 30;

export const fragmentationDetector: Detector = {
  id: "file-fragmentation",
  detect(input): Signal[] {
    if (input.scope !== "file" || !input.context.files) return [];

    const directory = directoryOf(input.facts.fileName);
    const grouped = new Map<string, { suffix: string; file: ProjectFileSummary }[]>();
    for (const file of summariesFor(input)) {
      if (directoryOf(file.fileName) !== directory) continue;
      const layer = layerIdentity(file);
      if (!layer) continue;
      const group = grouped.get(layer.stem) ?? [];
      group.push({ suffix: layer.suffix, file });
      grouped.set(layer.stem, group);
    }

    const signals: Signal[] = [];
    for (const [stem, group] of grouped) {
      if (!group.some((item) => item.file.fileName === input.facts.fileName)) continue;
      const suffixes = new Set(group.map((item) => item.suffix));
      if (group.length < MIN_FILES || suffixes.size < MIN_SUFFIXES) continue;
      const medianBehavior = median(group.map((item) => item.file.behavioralStatements));
      if (medianBehavior >= MAX_MEDIAN_BEHAVIOR) continue;

      const names = group.map((item) => baseName(item.file.fileName)).join(", ");
      const where = directory.length > 0 ? directory : "this directory";
      signals.push(
        withReviewContext(input, {
          type: "file-fragmentation",
          severity: "medium",
          confidence: 0.75,
          title: "Directory splits one idea into layers",
          evidence: [
            `${where} has ${group.length} small files for ${stem}: ${names}.`,
            `Their median behavioral statement count is ${medianBehavior}.`,
          ],
          interpretation:
            "Separate Factory, Builder, Strategy, Service, and Repository files can match a framework or a public layout. Here each file contains little behavior.",
          legitimateReasons: ["A framework or package layout may require one file per layer."],
          questions: ["Is this code intended to be reused?", "Is this architecture intentionally designed for future extension?"],
          locations: [location(input.facts, stem, anchorSpan(input.facts))],
          clusterId: `fragmentation:${directory}:${stem}`,
        }),
      );
    }
    return signals;
  },
};

function summariesFor(input: DetectorInput): ProjectFileSummary[] {
  const scanned = input.context.files ?? [];
  if (scanned.some((file) => file.fileName === input.facts.fileName)) return [...scanned];
  return [summaryFromFacts(input.facts), ...scanned];
}

function summaryFromFacts(facts: Facts): ProjectFileSummary {
  return {
    fileName: facts.fileName,
    linesOfCode: facts.linesOfCode,
    behavioralStatements: facts.behavioralStatements,
    names: [baseName(facts.fileName), ...facts.classes.map((cls) => cls.name), ...facts.functions.map((fn) => fn.name)],
  };
}

function layerIdentity(file: ProjectFileSummary): { stem: string; suffix: string } | undefined {
  for (const name of file.names) {
    const layer = parseLayer(name);
    if (layer) return layer;
  }
  return undefined;
}

function parseLayer(name: string): { stem: string; suffix: string } | undefined {
  const match = name.match(LAYER_SUFFIX);
  if (!match?.[1] || match.index === undefined || match.index === 0) return undefined;
  return { stem: name.slice(0, match.index), suffix: match[1] };
}

function directoryOf(fileName: string): string {
  const parts = fileName.split(/[/\\]/);
  parts.pop();
  return parts.join("/");
}

function baseName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.replace(/\.[^.]+$/, "");
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function anchorSpan(facts: Facts) {
  const spans = [...facts.interfaces, ...facts.classes, ...facts.functions, ...facts.typeAliases].map((item) => item.span);
  spans.sort((left, right) => left.start - right.start);
  return spans[0] ?? { start: 0, end: 0 };
}

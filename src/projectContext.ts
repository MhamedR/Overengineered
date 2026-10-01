import type { GenericUseSummary, ProjectContext, ProjectFileSummary } from "./detectors/types";
import { extractFacts } from "./parse/extract";
import type { Facts } from "./types";

export const MAX_PROJECT_FILES = 500;
export const MAX_PROJECT_MILLISECONDS = 2000;
export const MAX_PROJECT_FILE_CHARACTERS = 1_000_000;

export interface ProjectFile {
  fileName: string;
  text: string;
}

export interface ProjectScanOptions {
  maxFiles?: number;
  maxMilliseconds?: number;
  now?: () => number;
  /** True when the file list itself was cut off before this scan. */
  incomplete?: boolean;
}

export function buildProjectContext(analyzed: Facts, files: ProjectFile[], options: ProjectScanOptions = {}): ProjectContext {
  const maxFiles = options.maxFiles ?? MAX_PROJECT_FILES;
  const maxMilliseconds = options.maxMilliseconds ?? MAX_PROJECT_MILLISECONDS;
  const now = options.now ?? Date.now;
  const started = now();

  const watchedInterfaces = new Set(analyzed.interfaces.map((iface) => iface.name));
  const watchedNames = new Set<string>([
    ...analyzed.interfaces.map((iface) => iface.name),
    ...analyzed.classes.map((cls) => cls.name),
    ...analyzed.functions.map((fn) => fn.name),
  ]);
  const watchedGenerics = new Set(
    [...analyzed.interfaces, ...analyzed.classes, ...analyzed.functions, ...analyzed.typeAliases]
      .filter((item) => item.typeParameters.length > 0)
      .map((item) => item.name),
  );
  const localReferences = referenceCounts(analyzed);

  const externalImplementers = new Map<string, Set<string>>();
  const additionalReferences = new Map<string, number>();
  const summaries: ProjectFileSummary[] = [];
  const genericUses = new Map<string, string[][]>();
  let partial = options.incomplete === true;
  let scanned = 0;

  if (watchedNames.size > 0) {
    for (const file of files) {
      if (scanned >= maxFiles || now() - started >= maxMilliseconds) {
        partial = true;
        break;
      }
      scanned += 1;
      if (file.text.length > MAX_PROJECT_FILE_CHARACTERS) {
        partial = true;
        continue;
      }
      absorbFile(
        file,
        analyzed,
        watchedInterfaces,
        watchedNames,
        watchedGenerics,
        localReferences,
        externalImplementers,
        additionalReferences,
        summaries,
        genericUses,
      );
    }
  }

  return {
    partial,
    externalImplementers: freezeSets(externalImplementers),
    additionalReferences,
    ...(watchedNames.size > 0 ? { files: summaries, genericUses: freezeUses(genericUses) } : {}),
  };
}

function absorbFile(
  file: ProjectFile,
  analyzed: Facts,
  watchedInterfaces: Set<string>,
  watchedNames: Set<string>,
  watchedGenerics: Set<string>,
  localReferences: Map<string, number>,
  externalImplementers: Map<string, Set<string>>,
  additionalReferences: Map<string, number>,
  summaries: ProjectFileSummary[],
  genericUses: Map<string, string[][]>,
): void {
  const facts = extractFacts(file.text, file.fileName, "typescript");
  if (!summaries.some((item) => item.fileName === facts.fileName)) summaries.push(summaryOf(facts));
  for (const instantiation of facts.instantiations) {
    if (!watchedGenerics.has(instantiation.name)) continue;
    const lists = genericUses.get(instantiation.name) ?? [];
    lists.push(instantiation.typeArguments);
    genericUses.set(instantiation.name, lists);
  }
  const sameFile = file.fileName === analyzed.fileName;

  for (const cls of facts.classes) {
    for (const ref of cls.implements) {
      if (!watchedInterfaces.has(ref.name)) continue;
      const alreadyLocal = analyzed.classes.some(
        (local) => local.name === cls.name && local.implements.some((item) => item.name === ref.name),
      );
      if (alreadyLocal) continue;
      const names = externalImplementers.get(ref.name) ?? new Set<string>();
      names.add(cls.name);
      externalImplementers.set(ref.name, names);
    }
  }

  const counts = referenceCounts(facts);
  for (const name of watchedNames) {
    const seen = counts.get(name) ?? 0;
    const extra = sameFile ? Math.max(0, seen - (localReferences.get(name) ?? 0)) : seen;
    if (extra === 0) continue;
    additionalReferences.set(name, (additionalReferences.get(name) ?? 0) + extra);
  }
}

function referenceCounts(facts: Facts): Map<string, number> {
  const counts = new Map<string, number>();
  for (const reference of facts.references) {
    counts.set(reference.name, (counts.get(reference.name) ?? 0) + 1);
  }
  return counts;
}

function summaryOf(facts: Facts): ProjectFileSummary {
  const base = facts.fileName.split(/[/\\]/).pop() ?? facts.fileName;
  return {
    fileName: facts.fileName,
    linesOfCode: facts.linesOfCode,
    behavioralStatements: facts.behavioralStatements,
    names: [base.replace(/\.[^.]+$/, ""), ...facts.classes.map((cls) => cls.name), ...facts.functions.map((fn) => fn.name)],
  };
}

function freezeUses(source: Map<string, string[][]>): Map<string, GenericUseSummary> {
  const frozen = new Map<string, GenericUseSummary>();
  for (const [name, args] of source) frozen.set(name, { arguments: args });
  return frozen;
}

function freezeSets(source: Map<string, Set<string>>): Map<string, readonly string[]> {
  const frozen = new Map<string, readonly string[]>();
  for (const [name, values] of source) frozen.set(name, [...values]);
  return frozen;
}

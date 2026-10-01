import type { AnalysisScope } from "../commands";
import type { Facts, Severity, Signal } from "../types";

export interface ProjectFileSummary {
  fileName: string;
  linesOfCode: number;
  behavioralStatements: number;
  names: readonly string[];
}

export interface GenericUseSummary {
  arguments: readonly (readonly string[])[];
}

export interface ProjectContext {
  /** True when implementations outside the analyzed code were not fully searched. */
  partial: boolean;
  /** Class names that implement an interface beyond the classes already in the analyzed facts. */
  externalImplementers?: ReadonlyMap<string, readonly string[]>;
  /** References to analyzed declarations that sit outside the analyzed facts. */
  additionalReferences?: ReadonlyMap<string, number>;
  /** Source files the project scan parsed, used for directory-level signals. */
  files?: readonly ProjectFileSummary[];
  /** Explicit type arguments seen for generic declarations in the analyzed code. */
  genericUses?: ReadonlyMap<string, GenericUseSummary>;
}

export interface AnalysisSettings {
  singleImplementationSeverity: Severity;
  maxDependencyCount: number;
  maxCallDepth: number;
  maxNestingDepth: number;
}

export interface DetectorInput {
  facts: Facts;
  context: ProjectContext;
  settings: AnalysisSettings;
  scope: AnalysisScope;
}

export interface Detector {
  id: string;
  detect(input: DetectorInput): Signal[];
}

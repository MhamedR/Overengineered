import type { Signal } from "../types";
import { boilerplateDetector } from "./boilerplate";
import { callDepthDetector } from "./callDepth";
import { delegationDetector } from "./delegation";
import { dependencyDetector } from "./dependency";
import { factoryDetector } from "./factory";
import { fragmentationDetector } from "./fragmentation";
import { genericityDetector } from "./genericity";
import { isIgnoredSource } from "./support";
import { singleImplementationDetector } from "./singleImplementation";
import { singleUseDetector } from "./singleUse";
import { strategyDetector } from "./strategy";
import type { Detector, DetectorInput } from "./types";

const detectors: Detector[] = [
  singleImplementationDetector,
  singleUseDetector,
  delegationDetector,
  factoryDetector,
  strategyDetector,
  dependencyDetector,
  callDepthDetector,
  fragmentationDetector,
  genericityDetector,
  boilerplateDetector,
];

export function detectSignals(input: DetectorInput): Signal[] {
  if (isIgnoredSource(input.facts.fileName)) return [];
  const signals = detectors.flatMap((detector) => detector.detect(input));
  signals.sort((left, right) => (left.locations[0]?.start ?? 0) - (right.locations[0]?.start ?? 0) || left.type.localeCompare(right.type));
  return signals;
}

import type { Severity, Signal } from "./types";

export type ConcernBand = "low" | "moderate" | "high" | "very-high";

export interface ComplexityEstimate {
  score: number;
  band: ConcernBand;
  confidence: number;
}

const severityWeight: Record<Severity, number> = {
  info: 0,
  low: 8,
  medium: 16,
  high: 28,
};

export function scoreSignals(signals: Signal[], contextPartial: boolean): ComplexityEstimate {
  if (signals.length === 0) {
    return { score: 0, band: "low", confidence: contextPartial ? 0.45 : 0.7 };
  }

  const raw = clusteredWeight(signals) * (contextPartial ? 0.75 : 1);
  const score = saturate(raw);
  const average = signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length;
  return {
    score,
    band: concernBand(score),
    confidence: round2(contextPartial ? average * 0.75 : average),
  };
}

export function concernLabel(band: ConcernBand): string {
  switch (band) {
    case "low":
      return "Low";
    case "moderate":
      return "Moderate";
    case "high":
      return "High";
    case "very-high":
      return "Very high";
  }
}

function clusteredWeight(signals: Signal[]): number {
  const groups = new Map<string, number[]>();
  for (const signal of signals) {
    const weight = severityWeight[signal.severity] * signal.confidence;
    const group = groups.get(signal.clusterId) ?? [];
    group.push(weight);
    groups.set(signal.clusterId, group);
  }

  let total = 0;
  for (const weights of groups.values()) {
    weights.sort((left, right) => right - left);
    total += weights[0] ?? 0;
    for (const extra of weights.slice(1)) total += extra * 0.3;
  }
  return total;
}

function saturate(raw: number): number {
  const score = Math.round(100 * (1 - Math.exp(-raw / 45)));
  return Math.max(0, Math.min(100, score));
}

function concernBand(score: number): ConcernBand {
  if (score <= 30) return "low";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "very-high";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

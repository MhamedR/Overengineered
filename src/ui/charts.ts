import type { ConcernBand } from "../score";
import type { Severity, Signal, SignalType } from "../types";
import { escapeHtml } from "./html";

export const severityOrder: Severity[] = ["high", "medium", "low", "info"];

export const severityLabel: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const signalTypeLabel: Record<SignalType, string> = {
  "single-implementation-interface": "One-implementation interface",
  "single-use-abstraction": "Single-use abstraction",
  "delegation-only": "Forwarding method",
  "single-product-factory": "Single-product factory",
  "single-strategy": "Single strategy",
  "high-dependency-count": "Many constructor dependencies",
  "deep-indirection": "Deep call chain",
  "file-fragmentation": "Fragmented layer files",
  "unused-genericity": "Unvarying type parameters",
  "excessive-boilerplate": "Structure over behavior",
};

const DONUT_RADIUS = 42;
const DONUT_STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export interface DonutSegment {
  severity: Severity;
  count: number;
  length: number;
  offset: number;
}

export function severityCounts(signals: Signal[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const signal of signals) counts[signal.severity] += 1;
  return counts;
}

export function donutSegments(counts: Record<Severity, number>): DonutSegment[] {
  const total = severityOrder.reduce((sum, severity) => sum + counts[severity], 0);
  if (total === 0) return [];
  let offset = 0;
  const segments: DonutSegment[] = [];
  for (const severity of severityOrder) {
    const count = counts[severity];
    if (count === 0) continue;
    const length = (count / total) * CIRCUMFERENCE;
    segments.push({ severity, count, length, offset });
    offset += length;
  }
  return segments;
}

export function renderSeverityDonut(signals: Signal[]): string {
  const counts = severityCounts(signals);
  const segments = donutSegments(counts);
  const total = signals.length;
  const summary = severityOrder
    .filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severityLabel[severity].toLowerCase()}`)
    .join(", ");
  const label = total === 0 ? "No signals by severity." : `Signals by severity: ${summary}.`;

  const rings = segments
    .map(
      (segment) =>
        `<circle class="chart-part sev-stroke-${segment.severity}" data-severity="${segment.severity}" cx="60" cy="60" r="${DONUT_RADIUS}" fill="none" stroke-width="${DONUT_STROKE}" stroke-dasharray="${fixed(segment.length)} ${fixed(CIRCUMFERENCE - segment.length)}" stroke-dashoffset="${fixed(-segment.offset)}" transform="rotate(-90 60 60)"><title>${severityLabel[segment.severity]}: ${segment.count}</title></circle>`,
    )
    .join("");

  const legend = severityOrder
    .map(
      (severity) =>
        `<li class="chart-part" data-severity="${severity}"><span class="swatch sev-fill-${severity}"></span>${severityLabel[severity]}<strong>${counts[severity]}</strong></li>`,
    )
    .join("");

  return `<figure class="chart">
    <figcaption>Signals by severity</figcaption>
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 120 120" role="img" aria-label="${escapeHtml(label)}">
        <circle class="donut-track" cx="60" cy="60" r="${DONUT_RADIUS}" fill="none" stroke-width="${DONUT_STROKE}"></circle>
        ${rings}
        <text x="60" y="58" text-anchor="middle" class="donut-total">${total}</text>
        <text x="60" y="76" text-anchor="middle" class="donut-caption">${total === 1 ? "signal" : "signals"}</text>
      </svg>
      <ul class="legend">${legend}</ul>
    </div>
  </figure>`;
}

export interface TypeBar {
  type: SignalType;
  total: number;
  counts: Record<Severity, number>;
}

export function typeBars(signals: Signal[]): TypeBar[] {
  const byType = new Map<SignalType, TypeBar>();
  for (const signal of signals) {
    const bar = byType.get(signal.type) ?? { type: signal.type, total: 0, counts: { high: 0, medium: 0, low: 0, info: 0 } };
    bar.total += 1;
    bar.counts[signal.severity] += 1;
    byType.set(signal.type, bar);
  }
  return [...byType.values()].sort(
    (left, right) => right.total - left.total || signalTypeLabel[left.type].localeCompare(signalTypeLabel[right.type]),
  );
}

export function renderTypeBars(signals: Signal[]): string {
  const bars = typeBars(signals);
  if (bars.length === 0) {
    return `<figure class="chart"><figcaption>Signals by type</figcaption><p class="note">No signals to chart.</p></figure>`;
  }
  const max = Math.max(...bars.map((bar) => bar.total));
  const rows = bars
    .map((bar) => {
      const parts = severityOrder
        .filter((severity) => bar.counts[severity] > 0)
        .map(
          (severity) =>
            `<span class="bar-part chart-part sev-fill-${severity}" data-severity="${severity}" style="width:${fixed((bar.counts[severity] / max) * 100)}%" title="${severityLabel[severity]}: ${bar.counts[severity]}"></span>`,
        )
        .join("");
      const label = signalTypeLabel[bar.type];
      return `<li class="bar-row">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track" role="img" aria-label="${escapeHtml(`${label}: ${bar.total}`)}">${parts}</span>
        <span class="bar-value">${bar.total}</span>
      </li>`;
    })
    .join("");
  return `<figure class="chart"><figcaption>Signals by type</figcaption><ul class="bars">${rows}</ul></figure>`;
}

const bandSegments: Array<{ band: ConcernBand; label: string; from: number; to: number }> = [
  { band: "low", label: "Low", from: 0, to: 30 },
  { band: "moderate", label: "Moderate", from: 30, to: 60 },
  { band: "high", label: "High", from: 60, to: 80 },
  { band: "very-high", label: "Very high", from: 80, to: 100 },
];

export function renderScoreGauge(score: number, band: ConcernBand): string {
  const clamped = Math.max(0, Math.min(100, score));
  const zones = bandSegments
    .map(
      (segment) =>
        `<span class="gauge-zone band-fill-${segment.band}${segment.band === band ? " active" : ""}" style="width:${segment.to - segment.from}%" title="${segment.label}: ${segment.from}–${segment.to}"></span>`,
    )
    .join("");
  const ticks = bandSegments
    .map((segment) => `<span style="width:${segment.to - segment.from}%">${segment.label}</span>`)
    .join("");
  return `<figure class="chart gauge">
    <figcaption>Concern estimate</figcaption>
    <div class="gauge-track" role="img" aria-label="Concern estimate ${clamped} out of 100">
      ${zones}
      <span class="gauge-marker" style="left:${clamped}%"><span class="gauge-value">${clamped}</span></span>
    </div>
    <div class="gauge-ticks">${ticks}</div>
  </figure>`;
}

export interface ThresholdRow {
  label: string;
  value: number;
  limit: number;
}

export function renderThresholds(rows: ThresholdRow[]): string {
  const items = rows
    .map((row) => {
      const scale = Math.max(row.limit * 2, row.value, 1);
      const over = row.value > row.limit;
      return `<li class="threshold-row">
        <span class="bar-label">${escapeHtml(row.label)}</span>
        <span class="bar-track threshold-track" role="img" aria-label="${escapeHtml(`${row.label}: ${row.value}, setting ${row.limit}`)}">
          <span class="bar-part ${over ? "over" : "under"}" style="width:${fixed((row.value / scale) * 100)}%"></span>
          <span class="limit-tick" style="left:${fixed((row.limit / scale) * 100)}%" title="Setting: ${row.limit}"></span>
        </span>
        <span class="bar-value">${row.value} / ${row.limit}</span>
      </li>`;
    })
    .join("");
  return `<figure class="chart"><figcaption>Measured against your settings</figcaption><ul class="bars">${items}</ul></figure>`;
}

export function renderStatementMix(structural: number, behavioral: number): string {
  const total = structural + behavioral;
  if (total === 0) {
    return `<figure class="chart"><figcaption>Structure and behavior</figcaption><p class="note">No statements in this scope.</p></figure>`;
  }
  const structuralShare = Math.round((structural / total) * 100);
  const behavioralShare = 100 - structuralShare;
  return `<figure class="chart">
    <figcaption>Structure and behavior</figcaption>
    <div class="split-track" role="img" aria-label="${structural} structural statements, ${behavioral} behavioral statements">
      <span class="split-part structural" style="width:${structuralShare}%"></span>
      <span class="split-part behavioral" style="width:${behavioralShare}%"></span>
    </div>
    <ul class="legend inline">
      <li><span class="swatch structural"></span>Structural<strong>${structural} · ${structuralShare}%</strong></li>
      <li><span class="swatch behavioral"></span>Behavioral<strong>${behavioral} · ${behavioralShare}%</strong></li>
    </ul>
    <p class="note">Structural statements declare types, forward calls, or pass values through. Behavioral statements make decisions or change values.</p>
  </figure>`;
}

function fixed(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "") || "0";
}

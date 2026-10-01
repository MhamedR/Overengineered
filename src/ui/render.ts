import type { AnalysisSnapshot } from "../analyze";
import type { MarkupSnapshot } from "../markup/analyze";
import { concernLabel } from "../score";
import type { Signal, SignalLocation } from "../types";
import {
  renderScoreGauge,
  renderSeverityDonut,
  renderSplit,
  renderStatementMix,
  renderThresholds,
  renderTypeBars,
  severityCounts,
  severityLabel,
  severityOrder,
  signalTypeLabel,
} from "./charts";
import { escapeHtml } from "./html";
import { locationHref, uniqueLocations } from "./location";

export type PanelSnapshot = AnalysisSnapshot | MarkupSnapshot;

const questionOrder = [
  "Is another implementation expected?",
  "Is this abstraction required by a framework?",
  "Is this code intended to be reused?",
  "Is this architecture intentionally designed for future extension?",
  "Does a stylesheet or script select these wrappers by position?",
  "Could the inner element sit directly in the parent?",
  "Could the layout use fewer levels with grid or flexbox?",
  "Is this selector overriding styles you do not control?",
  "Would a single class on the element describe it?",
  "Which rules are these declarations competing with?",
  "Does each variable layer have a different reason to change?",
  "Would a shared class or variable remove the repetition?",
  "Are these rules expected to change independently?",
];

export function renderAnalysis(snapshot: PanelSnapshot, relativePath: string): string {
  const scope = snapshot.scope === "selection" ? "Selection" : snapshot.scope === "function" ? "Function" : "File";
  const confidence = Math.round(snapshot.confidence * 100);
  const questions = uniqueQuestions(snapshot.signals);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Overengineered</title>
  <style>${styles()}</style>
</head>
<body>
  <h1>OVERENGINEERING ANALYSIS</h1>
  <p class="path">${escapeHtml(scope)} · ${escapeHtml(relativePath)}</p>
  <section class="summary">
    <div class="stat"><span>Concern</span><strong class="band-${snapshot.band}">${escapeHtml(concernLabel(snapshot.band))}</strong></div>
    <div class="stat"><span>Confidence</span><strong>${confidence}%</strong></div>
    <div class="stat"><span>Complexity signals detected</span><strong>${snapshot.signals.length}</strong></div>
  </section>
  ${renderScoreGauge(snapshot.score, snapshot.band)}
  <p>Estimate: ${snapshot.score} / 100. This is an estimate of potential unnecessary complexity. It is not a code quality score.</p>
  ${snapshot.contextPartial ? "<p class=\"note\">Other files were not fully searched, so the concern estimate and confidence stay limited.</p>" : ""}

  <h2>Overview</h2>
  ${renderFilter(snapshot.signals)}
  <section class="charts">
    ${renderSeverityDonut(snapshot.signals)}
    ${renderTypeBars(snapshot.signals)}
  </section>

  ${snapshot.kind === "markup" ? renderMarkupShape(snapshot) : renderCodeShape(snapshot)}

  <h2>Detected signals</h2>
  ${snapshot.signals.length === 0 ? "<p>No complexity signals in this scope.</p>" : snapshot.signals.map(renderSignal).join("")}
  ${questions.length === 0 ? "" : `<h2>Suggested questions</h2><ul>${questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`}

  <h2>Metrics</h2>
  ${snapshot.kind === "markup" ? renderMarkupMetrics(snapshot) : renderMetrics(snapshot)}
</body>
</html>`;
}

function renderCodeShape(snapshot: AnalysisSnapshot): string {
  const metrics = snapshot.metrics;
  return `<h2>Code shape</h2>
  <section class="charts">
    ${renderStatementMix(metrics.structuralStatements, metrics.behavioralStatements)}
    ${renderThresholds([
      { label: "Constructor dependencies", value: metrics.dependencyCount, limit: snapshot.limits.maxDependencyCount },
      { label: "Call depth", value: metrics.callDepth, limit: snapshot.limits.maxCallDepth },
      { label: "Pass-through layers", value: metrics.indirectionLayers, limit: snapshot.limits.maxCallDepth },
    ])}
  </section>`;
}

function renderMarkupShape(snapshot: MarkupSnapshot): string {
  const metrics = snapshot.metrics;
  const charts: string[] = [];
  if (metrics.elements > 0) {
    charts.push(
      renderSplit({
        caption: "Wrappers and content",
        empty: "No elements in this scope.",
        first: { label: "Empty wrappers", value: metrics.bareWrappers, className: "structural", unit: "empty wrappers" },
        second: { label: "Other elements", value: metrics.elements - metrics.bareWrappers, className: "behavioral", unit: "other elements" },
        note: "Empty wrappers are div or span elements with no attributes and no text of their own.",
      }),
      renderThresholds([{ label: "Nesting depth", value: metrics.maxDepth, limit: snapshot.limits.maxNestingDepth }]),
    );
  }
  if (metrics.declarations > 0) {
    charts.push(
      renderSplit({
        caption: "Declarations using !important",
        empty: "No declarations in this scope.",
        first: { label: "!important", value: metrics.importantDeclarations, className: "important", unit: "!important declarations" },
        second: { label: "Normal", value: metrics.declarations - metrics.importantDeclarations, className: "normal", unit: "normal declarations" },
        note: "Each !important declaration overrides normal specificity, so the next override often needs one too.",
      }),
    );
  }
  return `<h2>Markup and style shape</h2>
  ${charts.length === 0 ? "<p class=\"note\">No elements or style rules in this scope.</p>" : `<section class="charts">${charts.join("")}</section>`}`;
}

function renderMarkupMetrics(snapshot: MarkupSnapshot): string {
  const metrics = snapshot.metrics;
  const rows: Array<[string, number | string]> = [["Non-blank lines", metrics.linesOfCode]];
  if (metrics.elements > 0) {
    rows.push(
      ["Elements", metrics.elements],
      ["Nesting depth", metrics.maxDepth],
      ["Empty wrappers", metrics.bareWrappers],
      ["Longest wrapper chain", metrics.longestWrapperChain],
    );
  }
  if (metrics.rules > 0 || metrics.variables > 0) {
    rows.push(
      ["Style rules", metrics.rules],
      ["Declarations", metrics.declarations],
      ["!important declarations", metrics.importantDeclarations],
      ["Longest selector (parts)", metrics.longestSelector],
      ["Highest specificity", metrics.highestSpecificity],
      ["Variables", metrics.variables],
      ["Longest variable alias chain", metrics.longestVariableChain],
      ["Repeated declaration blocks", metrics.duplicateBlocks],
    );
  }
  return `<dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`).join("")}</dl>`;
}

function renderFilter(signals: Signal[]): string {
  const counts = severityCounts(signals);
  const option = (id: string, label: string, count: number, checked: boolean) =>
    `<input type="radio" name="severity" id="filter-${id}" class="filter-input"${checked ? " checked" : ""}${count === 0 && !checked ? " disabled" : ""}><label for="filter-${id}">${label} <span class="count">${count}</span></label>`;
  return `<fieldset class="filter">
    <legend>Show severity</legend>
    ${option("all", "All", signals.length, true)}
    ${severityOrder.map((severity) => option(severity, severityLabel[severity], counts[severity], false)).join("")}
  </fieldset>`;
}

function renderMetrics(snapshot: AnalysisSnapshot): string {
  const metrics = snapshot.metrics;
  const rows: Array<[string, number]> = [
    ["Non-blank lines", metrics.linesOfCode],
    ["Functions", metrics.functions],
    ["Classes", metrics.classes],
    ["Interfaces", metrics.interfaces],
    ["Abstractions", metrics.abstractions],
    ["Max constructor dependencies", metrics.dependencyCount],
    ["Inheritance depth", metrics.inheritanceDepth],
    ["Call depth", metrics.callDepth],
    ["Cyclomatic complexity", metrics.cyclomaticComplexity],
    ["Indirection layers", metrics.indirectionLayers],
    ["Single-use abstractions", metrics.singleUseAbstractions],
  ];
  return `<dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`).join("")}</dl>`;
}

function renderSignal(signal: Signal): string {
  const locations = uniqueLocations(signal.locations);
  const first = locations[0];
  const href = first ? locationHref(first) : undefined;
  const names = locations.map((location) => locationLink(location)).join(", ");
  const confidence = Math.round(signal.confidence * 100);
  const openLabel = first ? `Open ${first.name} in the editor` : "";
  return `<article class="signal${href ? " has-location" : ""}" data-severity="${signal.severity}">
    ${href ? `<a class="signal-target" href="${escapeHtml(href)}" aria-label="${escapeHtml(openLabel)}" title="${escapeHtml(openLabel)}"></a>` : ""}
    <header class="signal-head">
      <span class="badge sev-fill-${signal.severity}">${escapeHtml(severityLabel[signal.severity])}</span>
      <h3>${href ? `<a class="signal-title" href="${escapeHtml(href)}">${escapeHtml(signal.title)}</a>` : escapeHtml(signal.title)}</h3>
    </header>
    <p class="meta">${escapeHtml(signalTypeLabel[signal.type])}${names ? ` · ${names}` : ""}</p>
    <div class="confidence" role="img" aria-label="Signal confidence ${confidence}%">
      <span class="confidence-track"><span class="confidence-fill" style="width:${confidence}%"></span></span>
      <span class="confidence-value">${confidence}% signal confidence</span>
    </div>
    <p><strong>Evidence</strong></p>
    <ul>${signal.evidence.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    <p><strong>Interpretation</strong></p>
    <p>${escapeHtml(signal.interpretation)}</p>
    ${
      signal.legitimateReasons.length === 0
        ? ""
        : `<p><strong>Why this may still be reasonable</strong></p><ul>${signal.legitimateReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
    }
  </article>`;
}

function locationLink(location: SignalLocation): string {
  const href = locationHref(location);
  const label = `Open ${location.name} in the editor`;
  return `<a class="location" href="${escapeHtml(href)}" title="${escapeHtml(label)}">${escapeHtml(location.name)}</a>`;
}

function uniqueQuestions(signals: Signal[]): string[] {
  const present = new Set(signals.flatMap((signal) => signal.questions));
  return questionOrder.filter((question) => present.has(question));
}

function styles(): string {
  const filterRules = severityOrder
    .map(
      (severity) => `
    body:has(#filter-${severity}:checked) .signal:not([data-severity="${severity}"]) { display: none; }
    body:has(#filter-${severity}:checked) .chart-part:not([data-severity="${severity}"]) { opacity: 0.18; }`,
    )
    .join("");

  return `
    :root {
      --sev-high: var(--vscode-charts-red, #e5534b);
      --sev-medium: var(--vscode-charts-orange, #d18616);
      --sev-low: var(--vscode-charts-blue, #3794ff);
      --sev-info: var(--vscode-descriptionForeground, #8b949e);
      --band-low: var(--vscode-charts-green, #57ab5a);
      --band-moderate: var(--vscode-charts-yellow, #c69026);
      --band-high: var(--vscode-charts-orange, #d18616);
      --band-very-high: var(--vscode-charts-red, #e5534b);
      --structural: var(--vscode-charts-purple, #b083f0);
      --behavioral: var(--vscode-charts-green, #57ab5a);
      --track: var(--vscode-editorWidget-border, rgba(128, 128, 128, 0.25));
      --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
      --muted: var(--vscode-descriptionForeground, #8b949e);
    }
    body {
      margin: 0;
      padding: 20px 24px 32px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }
    h1, h2, h3 { font-weight: 600; }
    h1 { font-size: 13px; letter-spacing: 0.04em; margin: 0 0 16px; }
    h2 { font-size: 16px; margin: 28px 0 12px; }
    h3 { font-size: 14px; margin: 0; }
    p { margin: 0 0 8px; }
    .path { color: var(--muted); margin-bottom: 16px; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .stat { padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; }
    .stat span { display: block; color: var(--muted); font-size: 12px; }
    .stat strong { font-size: 18px; }
    .band-high { color: var(--vscode-editorWarning-foreground, var(--band-high)); }
    .band-very-high { color: var(--vscode-editorError-foreground, var(--band-very-high)); }
    .note { color: var(--muted); }

    .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .chart { margin: 0 0 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 6px; }
    .chart figcaption { font-weight: 600; margin-bottom: 10px; }

    .donut-wrap { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .donut { width: 128px; height: 128px; flex: none; }
    .donut-track { stroke: var(--track); }
    .donut-total { font-size: 26px; font-weight: 600; fill: currentColor; }
    .donut-caption { font-size: 10px; fill: var(--muted); }
    .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; min-width: 120px; }
    .legend li { display: flex; align-items: center; gap: 8px; margin: 0; }
    .legend strong { margin-left: auto; padding-left: 12px; }
    .legend.inline { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); column-gap: 32px; margin-top: 8px; }
    .swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; }

    .sev-stroke-high { stroke: var(--sev-high); }
    .sev-stroke-medium { stroke: var(--sev-medium); }
    .sev-stroke-low { stroke: var(--sev-low); }
    .sev-stroke-info { stroke: var(--sev-info); }
    .sev-fill-high { background: var(--sev-high); }
    .sev-fill-medium { background: var(--sev-medium); }
    .sev-fill-low { background: var(--sev-low); }
    .sev-fill-info { background: var(--sev-info); }
    .chart-part { transition: opacity 120ms ease; }

    .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .bar-row, .threshold-row { display: grid; grid-template-columns: minmax(110px, 40%) 1fr auto; align-items: center; gap: 10px; margin: 0; }
    .bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { position: relative; display: flex; height: 10px; border-radius: 5px; background: var(--track); overflow: hidden; }
    .bar-part { display: block; height: 100%; }
    .bar-value { color: var(--muted); font-variant-numeric: tabular-nums; }
    .threshold-track { overflow: visible; }
    .threshold-track .bar-part { border-radius: 5px; }
    .threshold-track .under { background: var(--sev-low); }
    .threshold-track .over { background: var(--sev-medium); }
    .limit-tick { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: currentColor; }

    .gauge-track { position: relative; display: flex; height: 12px; border-radius: 6px; overflow: visible; margin-top: 22px; }
    .gauge-zone { height: 100%; opacity: 0.35; }
    .gauge-zone:first-child { border-radius: 6px 0 0 6px; }
    .gauge-zone:nth-child(4) { border-radius: 0 6px 6px 0; }
    .gauge-zone.active { opacity: 1; }
    .band-fill-low { background: var(--band-low); }
    .band-fill-moderate { background: var(--band-moderate); }
    .band-fill-high { background: var(--band-high); }
    .band-fill-very-high { background: var(--band-very-high); }
    .gauge-marker { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: currentColor; }
    .gauge-value { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 2px; font-weight: 600; font-size: 12px; }
    .gauge-ticks { display: flex; margin-top: 6px; color: var(--muted); font-size: 11px; }

    .split-track { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--track); }
    .split-part { display: block; height: 100%; }
    .structural { background: var(--structural); }
    .behavioral { background: var(--behavioral); }
    .important { background: var(--sev-medium); }
    .normal { background: var(--sev-low); }

    .filter { display: flex; flex-wrap: wrap; gap: 6px; border: 0; padding: 0; margin: 0 0 12px; }
    .filter legend { width: 100%; padding: 0; margin-bottom: 6px; color: var(--muted); font-size: 12px; }
    .filter-input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
    .filter label { padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; cursor: pointer; user-select: none; }
    .filter label .count { color: var(--muted); margin-left: 2px; }
    .filter-input:checked + label {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border-color: transparent;
    }
    .filter-input:checked + label .count { color: inherit; opacity: 0.8; }
    .filter-input:focus-visible + label { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 2px; }
    .filter-input:disabled + label { opacity: 0.4; cursor: default; }
    ${filterRules}

    .signal { position: relative; border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; margin: 0 0 12px; }
    .signal.has-location { cursor: pointer; }
    .signal-target { position: absolute; inset: 0; border-radius: inherit; z-index: 1; }
    .location { position: relative; z-index: 2; color: var(--vscode-textLink-foreground, #3794ff); }
    .signal-title, .location { text-decoration: none; }
    .signal-title { color: inherit; }
    .signal[data-severity="high"] { border-left: 3px solid var(--sev-high); }
    .signal[data-severity="medium"] { border-left: 3px solid var(--sev-medium); }
    .signal[data-severity="low"] { border-left: 3px solid var(--sev-low); }
    .signal[data-severity="info"] { border-left: 3px solid var(--sev-info); }
    .signal-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .badge { padding: 1px 8px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 600; }
    .meta { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .confidence { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .confidence-track { width: 120px; height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
    .confidence-fill { display: block; height: 100%; background: currentColor; opacity: 0.7; }
    .confidence-value { color: var(--muted); font-size: 12px; }

    dl { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 4px 16px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    ul { margin: 4px 0 8px; padding-left: 18px; }
    li { margin: 2px 0; }`;
}

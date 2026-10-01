import { describe, expect, it } from "vitest";
import { analyzeText, type AnalysisSnapshot } from "../src/analyze";
import { renderAnalysis } from "../src/ui/render";
import type { CodeMetrics, Signal } from "../src/types";
import { loggerSource } from "./fixtures/logger";

describe("renderAnalysis", () => {
  it("renders the logger analysis with evidence separated from interpretation", () => {
    const result = analyzeText({
      uri: "file:///render-logger.ts",
      version: 1,
      fileName: "logger.ts",
      languageId: "typescript",
      text: loggerSource,
      scope: "file",
      start: 0,
      end: loggerSource.length,
      position: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const html = renderAnalysis(result.snapshot, "logger.ts");
    expect(html).toContain("OVERENGINEERING ANALYSIS");
    expect(html).toContain("Concern");
    expect(html).toContain("Low");
    expect(html).toContain("Complexity signals detected");
    expect(html).toContain("Evidence");
    expect(html).toContain("Interpretation");
    expect(html).toContain("Suggested questions");
    expect(html).toContain("Interface has only one implementation");
    expect(html).toContain("It is not a code quality score.");
    expect(html).toContain("Other files were not fully searched");
    expect(html).not.toMatch(/AI-generated/i);
    expect(result.snapshot.band).toBe("low");
    expect(result.snapshot.signals.length).toBe(5);
  });

  it("escapes text that came from the source", () => {
    const html = renderAnalysis(snapshotWith(`<script>alert("x")</script>`), "file.ts");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders an empty scope without signal cards", () => {
    const snapshot = snapshotWith("unused");
    snapshot.signals = [];
    snapshot.score = 0;
    snapshot.band = "low";
    const html = renderAnalysis(snapshot, "empty.ts");
    expect(html).toContain("No complexity signals in this scope.");
    expect(html).not.toContain("Suggested questions");
    expect(html).toContain('aria-label="No signals by severity."');
    expect(html).toContain("No signals to chart.");
  });

  it("draws severity and type charts without scripts", () => {
    const html = renderAnalysis(snapshotWith("chart"), "file.ts");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("Signals by severity");
    expect(html).toContain('aria-label="Signals by severity: 1 medium."');
    expect(html).toContain("Signals by type");
    expect(html).toContain('aria-label="Forwarding method: 1"');
    expect(html).toContain('aria-label="Concern estimate 10 out of 100"');
    expect(html).toContain("Measured against your settings");
    expect(html).toContain('aria-label="Constructor dependencies: 0, setting 5"');
  });

  it("filters signal cards by severity with CSS only", () => {
    const html = renderAnalysis(snapshotWith("filter"), "file.ts");
    expect(html).toMatch(/<input type="radio" name="severity" id="filter-all" class="filter-input" checked>/);
    expect(html).toMatch(/id="filter-medium" class="filter-input">/);
    expect(html).toMatch(/id="filter-high" class="filter-input" disabled>/);
    expect(html).toContain('<article class="signal has-location" data-severity="medium">');
    expect(html).toContain('body:has(#filter-high:checked) .signal:not([data-severity="high"]) { display: none; }');
    expect(html).toContain('body:has(#filter-medium:checked) .chart-part:not([data-severity="medium"]) { opacity: 0.18; }');
  });

  it("links a signal card to its declaration without scripts", () => {
    const html = renderAnalysis(snapshotWith("open"), "file.ts");
    const href = `command:overengineered.revealLocation?${encodeURIComponent(
      JSON.stringify([{ fileName: "file.ts", name: "Service.log", start: 0, end: 10 }]),
    )}`;
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain(`<a class="signal-target" href="${href}" aria-label="Open Service.log in the editor"`);
    expect(html).toContain(`<a class="signal-title" href="${href}">Method only forwards a call</a>`);
    expect(html).toContain(`<a class="location" href="${href}" title="Open Service.log in the editor">Service.log</a>`);
  });
});

function snapshotWith(evidence: string): AnalysisSnapshot {
  const signal: Signal = {
    type: "delegation-only",
    severity: "medium",
    confidence: 0.45,
    title: "Method only forwards a call",
    evidence: [evidence],
    interpretation: "A forwarding method can be a boundary.",
    legitimateReasons: ["The forward may hide a dependency."],
    questions: ["Is this code intended to be reused?"],
    locations: [{ fileName: "file.ts", name: "Service.log", start: 0, end: 10 }],
    clusterId: "delegation:Service.log",
  };
  return {
    kind: "code",
    language: "typescript",
    scope: "file",
    facts: {
      fileName: "file.ts",
      language: "typescript",
      linesOfCode: 1,
      interfaces: [],
      classes: [],
      functions: [],
      typeAliases: [],
      callSites: [],
      constructions: [],
      instantiations: [],
      references: [],
      moduleStatements: [],
      looseStatements: [],
      structuralStatements: 0,
      behavioralStatements: 0,
    },
    metrics: emptyMetrics(),
    signals: [signal],
    score: 10,
    band: "low",
    confidence: 0.34,
    contextPartial: true,
    limits: { maxDependencyCount: 5, maxCallDepth: 4 },
  };
}

function emptyMetrics(): CodeMetrics {
  return {
    linesOfCode: 1,
    functions: 0,
    classes: 0,
    interfaces: 0,
    abstractions: 0,
    dependencyCount: 0,
    inheritanceDepth: 0,
    callDepth: 0,
    cyclomaticComplexity: 0,
    filesTouched: 1,
    indirectionLayers: 0,
    singleUseAbstractions: 0,
    behavioralStatements: 0,
    structuralStatements: 0,
  };
}

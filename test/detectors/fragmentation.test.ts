import { describe, expect, it } from "vitest";
import { buildProjectContext } from "../../src/projectContext";
import { extractFacts } from "../../src/parse/extract";
import { ofType, signalsFor } from "./helpers";

function thin(name: string): string {
  return `export class ${name} {\n  run() { return 1; }\n}\n`;
}

function heavy(name: string): string {
  const lines = Array.from({ length: 30 }, (_, index) => `    value = value + ${index};`).join("\n");
  return `export class ${name} {\n  run() {\n    let value = 0;\n${lines}\n    return value;\n  }\n}\n`;
}

function projectSignals(files: { fileName: string; text: string }[], scope: "file" | "selection" | "function" = "file") {
  const active = files[0];
  if (!active) return [];
  const facts = extractFacts(active.text, active.fileName, "typescript");
  return signalsFor(active.text, {
    fileName: active.fileName,
    scope,
    context: buildProjectContext(facts, files),
  });
}

describe("file fragmentation", () => {
  const stack = [
    { fileName: "feature/UserFactory.ts", text: thin("UserFactory") },
    { fileName: "feature/UserBuilder.ts", text: thin("UserBuilder") },
    { fileName: "feature/UserStrategy.ts", text: thin("UserStrategy") },
    { fileName: "feature/UserService.ts", text: thin("UserService") },
  ];

  it("reports a directory of tiny layer files that share a stem", () => {
    const [signal] = ofType(projectSignals(stack), "file-fragmentation");
    expect(signal).toMatchObject({
      severity: "medium",
      confidence: 0.75,
      title: "Directory splits one idea into layers",
      clusterId: "fragmentation:feature:User",
    });
    expect(signal?.evidence[0]).toContain("UserFactory");
    expect(signal?.evidence[0]).toContain("UserService");
  });

  it("stays quiet for a folder of independent commands", () => {
    const files = ["CreateUser", "DeleteUser", "ListUsers", "UpdateUser"].map((name) => ({
      fileName: `commands/${name}.ts`,
      text: `export function ${name[0]?.toLowerCase()}${name.slice(1)}(name: string) { return { name }; }\n`,
    }));
    expect(ofType(projectSignals(files), "file-fragmentation")).toEqual([]);
  });

  it("stays quiet when the layer files contain real behavior", () => {
    const files = ["UserFactory", "UserBuilder", "UserStrategy", "UserService"].map((name) => ({
      fileName: `feature/${name}.ts`,
      text: heavy(name),
    }));
    expect(ofType(projectSignals(files), "file-fragmentation")).toEqual([]);
  });

  it("stays quiet for three layer files, unrelated layer names, and a selection", () => {
    expect(ofType(projectSignals(stack.slice(0, 3)), "file-fragmentation")).toEqual([]);
    const unrelated = ["AlphaFactory", "BetaBuilder", "GammaStrategy", "DeltaService"].map((name) => ({
      fileName: `feature/${name}.ts`,
      text: thin(name),
    }));
    expect(ofType(projectSignals(unrelated), "file-fragmentation")).toEqual([]);
    expect(ofType(projectSignals(stack, "selection"), "file-fragmentation")).toEqual([]);
  });
});

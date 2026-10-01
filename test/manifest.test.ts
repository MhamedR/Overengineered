import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeLanguageIds, commands, supportedExtensions, supportedLanguageIds } from "../src/commands";

interface CommandContribution {
  command: string;
  title: string;
  category?: string;
}

interface MenuContribution {
  command: string;
  when?: string;
  group?: string;
}

interface PackageJson {
  main: string;
  engines: { vscode: string };
  contributes: {
    commands: CommandContribution[];
    menus: Record<string, MenuContribution[]>;
    configuration: {
      properties: Record<string, { type: string; default: unknown; enum?: string[] }>;
    };
  };
}

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageJson;
const extensionSource = readFileSync(join(root, "src/extension.ts"), "utf8");

const editorLanguageWhen = supportedLanguageIds.map((id) => `editorLangId == ${id}`).join(" || ");
const codeLanguageWhen = codeLanguageIds.map((id) => `editorLangId == ${id}`).join(" || ");

describe("extension manifest", () => {
  it("points VS Code at the esbuild bundle", () => {
    expect(packageJson.main).toBe("./dist/extension.js");
    expect(packageJson.engines.vscode).toBe("^1.90.0");
  });

  it("registers the palette commands and the context-menu label", () => {
    const byId = new Map(packageJson.contributes.commands.map((command) => [command.command, command]));

    expect(byId.get(commands.analyzeSelection)).toMatchObject({
      title: "Analyze Selection",
      category: "Overengineered",
    });
    expect(byId.get(commands.analyzeForOverengineering)).toEqual({
      command: commands.analyzeForOverengineering,
      title: "Analyze for Overengineering",
    });
    expect(byId.get(commands.analyzeFile)).toMatchObject({
      title: "Analyze File",
      category: "Overengineered",
    });
    expect(byId.get(commands.analyzeFunction)).toMatchObject({
      title: "Analyze Function",
      category: "Overengineered",
    });
  });

  it("places commands on the editor and explorer menus", () => {
    expect(packageJson.contributes.menus["commandPalette"]).toContainEqual({
      command: commands.analyzeForOverengineering,
      when: "false",
    });
    expect(packageJson.contributes.menus["editor/context"]).toContainEqual({
      command: commands.analyzeForOverengineering,
      when: `editorHasSelection && (${editorLanguageWhen})`,
      group: "overengineered",
    });
    expect(packageJson.contributes.menus["editor/context"]).toContainEqual({
      command: commands.analyzeFunction,
      when: codeLanguageWhen,
      group: "overengineered",
    });
    expect(packageJson.contributes.menus["explorer/context"]).toContainEqual({
      command: commands.analyzeFile,
      when: supportedExtensions.map((ext) => `resourceExtname == ${ext}`).join(" || "),
      group: "overengineered",
    });
  });

  it("declares the analysis settings the detectors will read", () => {
    const properties = packageJson.contributes.configuration.properties;

    expect(properties["overengineered.analysis.enabled"]).toMatchObject({ type: "boolean", default: true });
    expect(properties["overengineered.analysis.maxDependencyCount"]).toMatchObject({ type: "number", default: 5 });
    expect(properties["overengineered.analysis.maxCallDepth"]).toMatchObject({ type: "number", default: 4 });
    expect(properties["overengineered.analysis.maxNestingDepth"]).toMatchObject({ type: "number", default: 12 });
    expect(properties["overengineered.analysis.singleImplementationSeverity"]).toMatchObject({
      type: "string",
      default: "medium",
      enum: ["info", "low", "medium", "high"],
    });
    expect(properties["overengineered.ai.enabled"]).toBeUndefined();
    expect(properties["overengineered.ai.provider"]).toBeUndefined();
  });

  it("registers every command id from the extension entry point", () => {
    for (const key of Object.keys(commands)) {
      expect(extensionSource).toContain(`commands.${key}`);
    }
    expect(extensionSource).toContain("analyzeText");
    expect(extensionSource).toContain("showAnalysis");
  });
});

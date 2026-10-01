import { extname } from "node:path";
import * as vscode from "vscode";
import { analyzeText } from "./analyze";
import { commands, supportedLanguageIds, type AnalysisScope } from "./commands";
import { boundedInt, singleImplementationSeverity } from "./detectors/support";
import type { AnalysisSettings } from "./detectors/types";
import { MAX_PROJECT_FILES, type ProjectFile } from "./projectContext";
import { showAnalysis } from "./ui/panel";

const languageIds = new Set<string>(supportedLanguageIds);

export function activate(context: vscode.ExtensionContext): void {
  const analyzeSelection = () => {
    void runAnalysis("selection");
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(commands.analyzeSelection, analyzeSelection),
    vscode.commands.registerCommand(commands.analyzeForOverengineering, analyzeSelection),
    vscode.commands.registerCommand(commands.analyzeFile, (uri?: vscode.Uri) => {
      void runAnalysis("file", uri);
    }),
    vscode.commands.registerCommand(commands.analyzeFunction, () => {
      void runAnalysis("function");
    }),
  );
}

export function deactivate(): void {}

async function runAnalysis(scope: AnalysisScope, uri?: vscode.Uri): Promise<void> {
  if (!analysisEnabled()) {
    await vscode.window.showInformationMessage("Overengineered analysis is disabled.");
    return;
  }

  const document = await documentFor(scope, uri);
  if (!document) {
    await vscode.window.showInformationMessage(
      scope === "file"
        ? "Open a TypeScript or JavaScript file, or choose one in the Explorer."
        : "Open a TypeScript or JavaScript file to analyze.",
    );
    return;
  }

  const languageId = languageIdFor(document);
  if (!languageId) {
    await vscode.window.showInformationMessage("Overengineered analyzes TypeScript and JavaScript files.");
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (scope !== "file") {
    if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
      await vscode.window.showInformationMessage("Open a TypeScript or JavaScript file to analyze.");
      return;
    }
    if (scope === "selection" && editor.selection.isEmpty) {
      await vscode.window.showInformationMessage("Select some code, then run Analyze for Overengineering.");
      return;
    }
  }

  const text = document.getText();
  const selection = editor && editor.document.uri.toString() === document.uri.toString() ? editor.selection : undefined;
  const project = await loadProject(document);
  let result;
  try {
    result = analyzeText({
      uri: document.uri.toString(),
      version: document.version,
      fileName: document.fileName,
      languageId,
      text,
      scope,
      start: scope === "file" || !selection ? 0 : document.offsetAt(selection.start),
      end: scope === "file" || !selection ? text.length : document.offsetAt(selection.end),
      position: selection ? document.offsetAt(selection.active) : 0,
      settings: analysisSettings(),
      projectFiles: project.files,
      projectIncomplete: project.incomplete,
    });
  } catch {
    await vscode.window.showErrorMessage("Overengineered could not parse this file.");
    return;
  }

  if (!result.ok) {
    await vscode.window.showInformationMessage(result.message);
    return;
  }

  showAnalysis(result.snapshot, vscode.workspace.asRelativePath(document.uri));
}

function analysisSettings(): AnalysisSettings {
  const config = vscode.workspace.getConfiguration("overengineered.analysis");
  return {
    singleImplementationSeverity: singleImplementationSeverity(config.get("singleImplementationSeverity")),
    maxDependencyCount: boundedInt(config.get("maxDependencyCount"), 5, 1),
    maxCallDepth: boundedInt(config.get("maxCallDepth"), 4, 1),
  };
}

async function loadProject(document: vscode.TextDocument): Promise<{ files: ProjectFile[]; incomplete: boolean }> {
  const active = { fileName: document.fileName, text: document.getText() };
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return { files: [active], incomplete: false };
  }

  let uris: vscode.Uri[];
  try {
    uris = await vscode.workspace.findFiles(
      "{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.mjs,**/*.cjs}",
      "{**/node_modules/**,**/dist/**,**/out/**,**/.git/**}",
      MAX_PROJECT_FILES + 1,
    );
  } catch {
    return { files: [active], incomplete: true };
  }

  const incomplete = uris.length > MAX_PROJECT_FILES;
  const files: ProjectFile[] = [];
  for (const uri of uris.slice(0, MAX_PROJECT_FILES)) {
    const open = vscode.workspace.textDocuments.find((item) => item.uri.toString() === uri.toString());
    if (open?.fileName === document.fileName) continue;
    try {
      const text = open ? open.getText() : new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(uri));
      files.push({ fileName: open?.fileName ?? uri.fsPath, text });
    } catch {
      return { files: [active, ...files], incomplete: true };
    }
  }
  return { files: [active, ...files.filter((file) => file.fileName !== document.fileName)], incomplete };
}

function analysisEnabled(): boolean {
  return vscode.workspace.getConfiguration("overengineered.analysis").get<boolean>("enabled", true);
}

async function documentFor(scope: AnalysisScope, uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (scope === "file" && uri) return vscode.workspace.openTextDocument(uri);
  return vscode.window.activeTextEditor?.document;
}

function languageIdFor(document: vscode.TextDocument): string | undefined {
  if (languageIds.has(document.languageId)) return document.languageId;
  switch (extname(document.fileName).toLowerCase()) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".tsx":
      return "typescriptreact";
    case ".jsx":
      return "javascriptreact";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    default:
      return undefined;
  }
}

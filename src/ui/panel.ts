import * as vscode from "vscode";
import type { AnalysisSnapshot } from "../analyze";
import { renderAnalysis } from "./render";

let panel: vscode.WebviewPanel | undefined;

export function showAnalysis(snapshot: AnalysisSnapshot, relativePath: string): void {
  const html = renderAnalysis(snapshot, relativePath);
  if (panel) {
    panel.webview.html = html;
    panel.reveal(vscode.ViewColumn.Beside, true);
    return;
  }

  panel = vscode.window.createWebviewPanel("overengineered.analysis", "Overengineered", vscode.ViewColumn.Beside, {
    enableScripts: false,
    retainContextWhenHidden: true,
  });
  panel.onDidDispose(() => {
    panel = undefined;
  });
  panel.webview.html = html;
}

export const commands = {
  analyzeSelection: "overengineered.analyzeSelection",
  analyzeForOverengineering: "overengineered.analyzeForOverengineering",
  analyzeFile: "overengineered.analyzeFile",
  analyzeFunction: "overengineered.analyzeFunction",
} as const;

export const codeLanguageIds = [
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
] as const;

export const markupLanguageIds = ["html", "vue", "svelte", "css", "scss", "less"] as const;

export const supportedLanguageIds = [...codeLanguageIds, ...markupLanguageIds] as const;

export const supportedExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".less",
] as const;

export type MarkupLanguage = (typeof markupLanguageIds)[number];

export type AnalysisScope = "selection" | "file" | "function";

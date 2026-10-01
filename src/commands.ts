export const commands = {
  analyzeSelection: "overengineered.analyzeSelection",
  analyzeForOverengineering: "overengineered.analyzeForOverengineering",
  analyzeFile: "overengineered.analyzeFile",
  analyzeFunction: "overengineered.analyzeFunction",
} as const;

export const supportedLanguageIds = [
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
] as const;

export const supportedExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

export type AnalysisScope = "selection" | "file" | "function";

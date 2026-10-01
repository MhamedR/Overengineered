import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").Plugin} */
const problemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log("[watch] build finished");
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode", "typescript"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: !production,
  sourcesContent: false,
  minify: production,
  logLevel: "silent",
  plugins: [problemMatcherPlugin],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}

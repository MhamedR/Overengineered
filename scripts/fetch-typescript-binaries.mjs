import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const version = "7.0.2";
const packages = [
  "typescript-darwin-arm64",
  "typescript-darwin-x64",
  "typescript-linux-arm64",
  "typescript-linux-x64",
  "typescript-win32-arm64",
  "typescript-win32-x64",
];

const destination = join(process.cwd(), "node_modules", "@typescript");
mkdirSync(destination, { recursive: true });

for (const name of packages) {
  const binary = join(destination, name, "lib", name.startsWith("typescript-win32-") ? "tsc.exe" : "tsc");
  if (existsSync(binary)) continue;

  const staging = join(tmpdir(), `overengineered-${name}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  execFileSync("npm", ["pack", `@typescript/${name}@${version}`], { cwd: staging, stdio: "inherit" });
  execFileSync("tar", ["-xzf", `typescript-${name}-${version}.tgz`], { cwd: staging, stdio: "inherit" });
  rmSync(join(destination, name), { recursive: true, force: true });
  execFileSync("mv", [join(staging, "package"), join(destination, name)]);
  rmSync(staging, { recursive: true, force: true });
}

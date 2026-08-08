import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsRoot = resolve(projectRoot, "artifacts");

if (
  artifactsRoot === projectRoot ||
  dirname(artifactsRoot) !== projectRoot ||
  !artifactsRoot.endsWith(`${process.platform === "win32" ? "\\" : "/"}artifacts`)
) {
  throw new Error(`Refusing to clean an unexpected path: ${artifactsRoot}`);
}

rmSync(artifactsRoot, { force: true, recursive: true });
console.log(`Removed generated Windows artifacts: ${artifactsRoot}`);

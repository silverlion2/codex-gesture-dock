import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, process.argv[2] ?? "artifacts/sbom.cdx.json");
const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf8"),
);
const npmCommand = process.env.npm_execpath
  ? process.execPath
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const npmArgs = process.env.npm_execpath
  ? [
      process.env.npm_execpath,
      "sbom",
      "--omit=dev",
      "--sbom-format=cyclonedx",
      "--sbom-type=application",
    ]
  : [
      "sbom",
      "--omit=dev",
      "--sbom-format=cyclonedx",
      "--sbom-type=application",
    ];
const rawSbom = execFileSync(npmCommand, npmArgs, {
  cwd: projectRoot,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const sbom = JSON.parse(rawSbom);

if (
  sbom.bomFormat !== "CycloneDX" ||
  sbom.metadata?.component?.version !== packageJson.version ||
  sbom.metadata?.component?.purl !==
    `pkg:npm/${packageJson.name}@${packageJson.version}` ||
  !Array.isArray(sbom.components) ||
  sbom.components.length === 0
) {
  throw new Error("Generated SBOM metadata does not match package.json.");
}

sbom.metadata.component.name = packageJson.name;
sbom.metadata.component.description = packageJson.description;
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
console.log(
  `Generated CycloneDX SBOM with ${sbom.components.length} production components: ${outputPath}`,
);

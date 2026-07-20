import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseSemver } from "./release-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(projectRoot, filename), "utf8"));
}

const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const versions = {
  "package.json": packageJson.version,
  "package-lock.json": packageLock.version,
  "package-lock.json root package": packageLock.packages?.[""]?.version,
};

parseSemver(packageJson.version);

for (const [source, version] of Object.entries(versions)) {
  if (version !== packageJson.version) {
    throw new Error(
      `Version mismatch: ${source} has ${version ?? "no version"}; expected ${packageJson.version}.`,
    );
  }
}

const tagFlag = process.argv.indexOf("--tag");
const suppliedTag = tagFlag >= 0 ? process.argv[tagFlag + 1] : undefined;
if (tagFlag >= 0 && !suppliedTag) {
  throw new Error("--tag requires a value such as v0.4.0.");
}

if (suppliedTag && suppliedTag !== `v${packageJson.version}`) {
  throw new Error(
    `Tag mismatch: ${suppliedTag} does not match package version v${packageJson.version}.`,
  );
}

console.log(
  `Version check passed: ${packageJson.name} v${packageJson.version}` +
    (suppliedTag ? ` matches ${suppliedTag}.` : "."),
);

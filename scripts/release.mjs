import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { compareSemver, resolveReleaseVersion } from "./release-utils.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((argument) => argument.startsWith("--")));
const targetArgument = rawArgs.find((argument) => !argument.startsWith("--"));
const supportedFlags = new Set(["--dry-run", "--no-push"]);

for (const flag of flags) {
  if (!supportedFlags.has(flag)) throw new Error(`Unknown flag: ${flag}`);
}

if (!targetArgument) {
  throw new Error(
    "Usage: npm run release -- <patch|minor|major|x.y.z> [--dry-run] [--no-push]",
  );
}

function executable(command) {
  return process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
}

function run(command, args, options = {}) {
  const result = spawnSync(executable(command), args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed.${detail ? `\n${detail}` : ""}`);
  }

  return options.capture ? (result.stdout ?? "").trim() : result.status;
}

function succeeds(command, args) {
  const result = spawnSync(executable(command), args, {
    cwd: projectRoot,
    stdio: "ignore",
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(projectRoot, filename), "utf8"));
}

async function updateChangelog(version) {
  const changelogPath = path.join(projectRoot, "CHANGELOG.md");
  const changelog = await readFile(changelogPath, "utf8");
  if (changelog.includes(`## [${version}]`)) return;

  const firstRelease = changelog.search(/^## \[/m);
  if (firstRelease < 0) throw new Error("CHANGELOG.md has no release heading.");

  const date = new Date().toISOString().slice(0, 10);
  const entry = [
    `## [${version}] - ${date}`,
    "",
    "### Changed",
    "",
    `- Release ${version}. See the generated GitHub release notes for the complete commit list.`,
    "",
  ].join("\n");
  const link = `\n[${version}]: https://github.com/silverlion2/codex-gesture-dock/releases/tag/v${version}\n`;
  const updated =
    `${changelog.slice(0, firstRelease)}${entry}${changelog.slice(firstRelease)}`.trimEnd() +
    link;
  await writeFile(changelogPath, updated, "utf8");
}

const expectedBranch = process.env.RELEASE_BRANCH || "main";
const status = run("git", ["status", "--porcelain"], { capture: true });
if (status) throw new Error("The working tree must be clean before a release.");

const branch = run("git", ["branch", "--show-current"], { capture: true });
if (branch !== expectedBranch) {
  throw new Error(`Releases must run from ${expectedBranch}; current branch is ${branch || "detached"}.`);
}

run("git", ["fetch", "origin", "--tags", "--prune"]);
const upstream = run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
  capture: true,
});
const [ahead, behind] = run("git", ["rev-list", "--left-right", "--count", "HEAD...@{u}"], {
  capture: true,
})
  .split(/\s+/)
  .map(Number);
if (behind > 0) throw new Error(`Local ${branch} is ${behind} commit(s) behind ${upstream}.`);

const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const currentVersion = packageJson.version;
if (
  packageLock.version !== currentVersion ||
  packageLock.packages?.[""]?.version !== currentVersion
) {
  throw new Error("package.json and package-lock.json versions are not synchronized.");
}

const targetVersion = resolveReleaseVersion(currentVersion, targetArgument);
if (compareSemver(targetVersion, currentVersion) <= 0) {
  throw new Error(`Target ${targetVersion} must be newer than current version ${currentVersion}.`);
}

if (succeeds("git", ["show-ref", "--verify", "--quiet", `refs/tags/v${targetVersion}`])) {
  throw new Error(`Tag v${targetVersion} already exists.`);
}

const latestTag = run("git", ["describe", "--tags", "--abbrev=0"], {
  capture: true,
  allowFailure: true,
});
const logArgs = latestTag
  ? ["log", "--oneline", `${latestTag}..HEAD`]
  : ["log", "--oneline", "-n", "20"];
const commits = run("git", logArgs, { capture: true }) || "(no unreleased commits)";

console.log(`\nRelease preflight`);
console.log(`  Branch:   ${branch} (${ahead} commit(s) ahead of ${upstream})`);
console.log(`  Version:  ${currentVersion} -> ${targetVersion}`);
console.log(`  Push:     ${flags.has("--no-push") ? "disabled" : "enabled"}`);
console.log(`\nCommits included:\n${commits}\n`);

run("npm", ["run", "version:check"]);
run("npm", ["test"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "build"]);

if (flags.has("--dry-run")) {
  console.log(`\nDry run passed. No files, commits, tags, or remotes were changed.`);
  process.exit(0);
}

if (!process.stdin.isTTY) {
  throw new Error("Interactive confirmation is required; use --dry-run in automation.");
}

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const confirmation = await prompt.question(`Type "release v${targetVersion}" to continue: `);
prompt.close();
if (confirmation !== `release v${targetVersion}`) {
  throw new Error("Release cancelled; confirmation did not match.");
}

run("npm", ["version", targetVersion, "--no-git-tag-version"]);
await updateChangelog(targetVersion);
run("git", ["add", "--", "package.json", "package-lock.json", "CHANGELOG.md"]);
run("git", ["commit", "-m", `release: v${targetVersion}`]);
run("git", ["tag", "-a", `v${targetVersion}`, "-m", `Codex Gesture Dock v${targetVersion}`]);

if (flags.has("--no-push")) {
  console.log(`Created local commit and tag v${targetVersion}; push was disabled.`);
} else {
  run("git", ["push", "origin", expectedBranch]);
  run("git", ["push", "origin", `v${targetVersion}`]);
  console.log(`Pushed ${expectedBranch} and v${targetVersion}; GitHub Actions will publish the release.`);
}

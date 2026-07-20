const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSemver(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) {
    throw new Error(`Expected a stable semantic version (x.y.z), received: ${version}`);
  }

  return match.slice(1).map(Number);
}

export function compareSemver(left, right) {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return Math.sign(leftParts[index] - rightParts[index]);
    }
  }

  return 0;
}

export function resolveReleaseVersion(currentVersion, target) {
  const [major, minor, patch] = parseSemver(currentVersion);

  if (target === "major") return `${major + 1}.0.0`;
  if (target === "minor") return `${major}.${minor + 1}.0`;
  if (target === "patch") return `${major}.${minor}.${patch + 1}`;

  parseSemver(target);
  return target;
}

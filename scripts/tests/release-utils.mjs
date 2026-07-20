import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSemver,
  parseSemver,
  resolveReleaseVersion,
} from "../release-utils.mjs";

test("parseSemver accepts stable semantic versions", () => {
  assert.deepEqual(parseSemver("0.4.0"), [0, 4, 0]);
  assert.deepEqual(parseSemver("12.34.56"), [12, 34, 56]);
});

test("parseSemver rejects tags, prereleases, and leading zeroes", () => {
  for (const invalid of ["v0.4.0", "0.4", "0.4.0-beta.1", "01.2.3"]) {
    assert.throws(() => parseSemver(invalid));
  }
});

test("compareSemver orders stable releases", () => {
  assert.equal(compareSemver("0.4.0", "0.3.9"), 1);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.equal(compareSemver("1.2.3", "2.0.0"), -1);
});

test("resolveReleaseVersion supports bumps and explicit versions", () => {
  assert.equal(resolveReleaseVersion("0.4.0", "patch"), "0.4.1");
  assert.equal(resolveReleaseVersion("0.4.0", "minor"), "0.5.0");
  assert.equal(resolveReleaseVersion("0.4.0", "major"), "1.0.0");
  assert.equal(resolveReleaseVersion("0.4.0", "0.6.2"), "0.6.2");
});

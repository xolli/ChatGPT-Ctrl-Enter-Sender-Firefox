const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

describe("Update path", () => {
  it("adds new sites as optional permissions without expanding required access", () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, "baseline-manifest.json"), "utf8"));
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "manifest.json"), "utf8"));
    const configs = fs.readFileSync(path.join(REPO_ROOT, "constants", "site-configs.js"), "utf8");
    const baselineRequired = new Set(baseline.host_permissions);
    const currentOptional = new Set(manifest.optional_host_permissions);

    assert.deepEqual(manifest.background, { scripts: ["service-worker.js"], type: "module" });
    for (const host of manifest.host_permissions) {
      assert.ok(baselineRequired.has(host), `Required permission is new since ${baseline.version}: ${host}`);
    }

    const optionalEntries = [...configs.matchAll(/\{ hostname: "[^"]+", matchPatterns: \[([^\]]+)\], optional: true \}/g)];
    assert.ok(optionalEntries.length > 0);
    for (const [, patterns] of optionalEntries) {
      for (const [, pattern] of patterns.matchAll(/"(https:\/\/[^"]+)"/g)) {
        assert.ok(currentOptional.has(pattern), `Opt-in host must be an optional permission: ${pattern}`);
      }
    }
  });
});

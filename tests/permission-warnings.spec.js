const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BASELINE_MANIFEST = path.join(__dirname, "baseline-manifest.json");
const CURRENT_MANIFEST = path.join(__dirname, "..", "manifest.json");

describe("Permission Update Regression", () => {
  it("does not introduce required host permissions", () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_MANIFEST, "utf8"));
    const current = JSON.parse(fs.readFileSync(CURRENT_MANIFEST, "utf8"));
    const baselineRequiredHosts = new Set(baseline.host_permissions ?? []);

    for (const host of current.host_permissions ?? []) {
      assert.ok(baselineRequiredHosts.has(host), `New required host permission was added: "${host}"`);
    }
  });
});

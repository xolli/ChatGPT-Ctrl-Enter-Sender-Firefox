const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { expect } = require("@wdio/globals");
const { extensionExecute, openExtensionPage, setupExtension } = require("./wdio-helpers");

setupExtension();

describe("Optional Sites", () => {
  it("uses Firefox background scripts without declarativeContent", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
    assert.deepEqual(manifest.background, { scripts: ["service-worker.js"], type: "module" });
    assert.ok(!manifest.permissions.includes("declarativeContent"));
    assert.ok(manifest.browser_specific_settings.gecko.strict_min_version);
  });

  it("does not register dynamic content scripts without an optional permission", async function () {
    await openExtensionPage("options/options.html");
    const granted = await extensionExecute(() =>
      browser.permissions.contains({ origins: ["https://www.genspark.ai/*"] })
    );
    if (granted) this.skip();

    const registered = await extensionExecute(() => browser.scripting.getRegisteredContentScripts());
    expect(registered).toEqual([]);
  });
});

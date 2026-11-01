const { expect } = require("@wdio/globals");
const {
  extensionExecute,
  extensionExecuteAsync,
  openExtensionPage,
  setupExtension,
  startFixtureServer,
} = require("./wdio-helpers");

setupExtension();

let fixtureServer;

before(async () => {
  fixtureServer = await startFixtureServer(() => "<!doctype html><title>ChatGPT fixture</title>");
});

after(async () => {
  await fixtureServer.close();
});

async function clearSettings() {
  await extensionExecuteAsync((done) => browser.storage.sync.clear().then(done));
}

async function getSiteSettings() {
  const stored = await extensionExecuteAsync((done) =>
    browser.storage.sync.get("siteSettings").then(done)
  );
  return stored.siteSettings ?? {};
}

describe("Site settings", () => {
  it("preserves the latest settings when saving an options-page change", async () => {
    await openExtensionPage("options/options.html");
    await clearSettings();

    await browser.waitUntil(() => $('[id="chatgpt.com"]').isExisting(), { timeout: 10000 });
    const chatGptCheckbox = await $('[id="chatgpt.com"]');
    const claudeCheckbox = await $('[id="claude.ai"]');
    await expect(chatGptCheckbox).toBeChecked();
    await expect(claudeCheckbox).toBeChecked();

    await extensionExecuteAsync((done) => browser.storage.sync.set({
      siteSettings: {
        "chatgpt.com": false,
        "www.genspark.ai": false,
      },
    }).then(done));

    await claudeCheckbox.click();
    await $("#saveButton").click();

    await browser.waitUntil(async () => {
      const settings = await getSiteSettings();
      return settings["chatgpt.com"] === false &&
        settings["claude.ai"] === false &&
        settings["www.genspark.ai"] === false;
    });
  });

  it("preserves both concurrent partial site-setting updates", async () => {
    await openExtensionPage("options/options.html");
    await clearSettings();

    const responses = await extensionExecuteAsync((done) => Promise.all([
      browser.runtime.sendMessage({
        type: "update-site-settings",
        updates: { "chatgpt.com": false },
      }),
      browser.runtime.sendMessage({
        type: "update-site-settings",
        updates: { "claude.ai": false },
      }),
    ]).then(done));

    expect(responses).toEqual([{ ok: true }, { ok: true }]);
    await browser.waitUntil(async () => {
      const settings = await getSiteSettings();
      return settings["chatgpt.com"] === false && settings["claude.ai"] === false;
    });
  });

  it("rejects unsupported hosts in site-setting updates", async () => {
    await openExtensionPage("options/options.html");
    await clearSettings();

    const response = await extensionExecuteAsync((done) => browser.runtime.sendMessage({
      type: "update-site-settings",
      updates: { "example.com": true },
    }).then(done));

    expect(response).toEqual({ ok: false, error: "Invalid site setting update" });
    expect(await getSiteSettings()).toEqual({});
  });

  it("updates the active site's setting from the popup", async () => {
    await openExtensionPage("options/options.html");
    await clearSettings();

    const siteUrl = fixtureServer.url("chatgpt.com");
    await browser.newWindow(siteUrl, { type: "tab" });

    await openExtensionPage("popup/popup.html", { useCurrentPage: true });

    const toggle = await $("#isEnabled");
    await expect($("#toggleSection")).toBeDisplayed();
    await expect(toggle).toBeChecked();
    await extensionExecute(() => document.querySelector("#isEnabled").click());

    await browser.waitUntil(async () => (await getSiteSettings())["chatgpt.com"] === false);
    await expect($("#statusMessage")).not.toBeDisplayed();
  });
});

const { expect } = require("@wdio/globals");
const { openExtensionPage, setupExtension } = require("./wdio-helpers");

setupExtension();

describe("Extension Loading", () => {
  it("installs the extension in Firefox", async () => {
    const url = await browser.execute(() =>
      document.querySelector('meta[name="ctrl-enter-test-extension-url"]')?.content
    );
    expect(url).toMatch(/^moz-extension:\/\//);
  });

  it("opens the popup page", async () => {
    await openExtensionPage("popup/popup.html");
    expect(await browser.execute(() => document.title)).not.toBe("");
  });

  it("opens the options page", async () => {
    await openExtensionPage("options/options.html");
    expect(await browser.execute(() => document.title)).not.toBe("");
  });
});

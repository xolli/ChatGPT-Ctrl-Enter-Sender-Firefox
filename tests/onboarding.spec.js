const { expect } = require("@wdio/globals");
const { extensionPage, setupExtension } = require("./wdio-helpers");

setupExtension();

describe("Opt-in site announcement", () => {
  it("opens the options page on first run and records the sites", async () => {
    const optionsUrl = extensionPage("options/options.html");

    await browser.waitUntil(async () => {
      const handles = await browser.getWindowHandles();
      for (const handle of handles) {
        await browser.switchToWindow(handle);
        if ((await browser.getUrl()) === optionsUrl) return true;
      }
      return false;
    }, { timeout: 10000 });

    const handles = await browser.getWindowHandles();
    const optionsPages = [];
    for (const handle of handles) {
      await browser.switchToWindow(handle);
      if ((await browser.getUrl()) === optionsUrl) optionsPages.push(handle);
    }
    expect(optionsPages).toHaveLength(1);

    await browser.switchToWindow(optionsPages[0]);
    await browser.waitUntil(async () => {
      const stored = await browser.executeAsync((done) => {
        browser.storage.local.get("announcedOptionalSites").then(done);
      });
      return stored.announcedOptionalSites?.length > 0;
    }, { timeout: 10000 });
  });
});

/**
 * Checks supported sites for their expected input element.
 * Auth-required sites are informational when no saved login is available.
 */
const path = require("node:path");
const { expect } = require("@wdio/globals");
const { setupExtension } = require("../wdio-helpers");
const { SITES } = require("./site-definitions");

setupExtension();

const publicSites = SITES.filter((site) => !site.requiresAuth);
const authSites = SITES.filter((site) => site.requiresAuth);

describe("Public Sites — Input Detection", () => {
  for (const site of publicSites) {
    it(`${site.name}: finds the input element`, async () => {
      await browser.newWindow("about:blank", { type: "tab" });
      await browser.url(site.url);
      await browser.pause(3000);

      const input = await $(site.inputSelector);
      if (await input.isExisting()) {
        console.log(`  ✅ ${site.name}: Input element found (${site.inputSelector})`);
      } else {
        console.log(`  ⚠️ ${site.name}: Input element NOT found (${site.inputSelector})`);
        console.log(`     Page URL: ${await browser.getUrl()}`);
        await browser.saveScreenshot(path.resolve(
          __dirname,
          "..",
          "screenshots",
          `${site.name.toLowerCase()}-input-not-found.png`
        ));
      }

      await expect(input).toBeExisting();
    });
  }
});

describe("Auth Sites — Input Detection (requires login)", () => {
  for (const site of authSites) {
    it(`${site.name}: checks for the input element`, async () => {
      await browser.newWindow("about:blank", { type: "tab" });
      await browser.url(site.url);
      await browser.pause(5000);

      const input = await $(site.inputSelector);
      if (await input.isExisting()) {
        console.log(`  ✅ ${site.name}: Input element found`);
      } else {
        console.log(`  ⚠️ ${site.name}: Input not found. Current URL: ${await browser.getUrl()}`);
        console.log("     This is expected if not logged in.");
        await browser.saveScreenshot(path.resolve(
          __dirname,
          "..",
          "screenshots",
          `${site.name.toLowerCase()}-needs-auth.png`
        ));
      }
    });
  }
});

/**
 * Live-site checks for Enter/newline and Ctrl+Enter/submission behavior.
 * Run `npm run login` first for the sites that require an account.
 */
const path = require("node:path");
const { expect } = require("@wdio/globals");
const { pressCtrlEnter, setupExtension } = require("../wdio-helpers");
const { SITES } = require("./site-definitions");

const TEST_TEXT = "test_ctrl_enter_extension";
const NEWLINE_TEST_TEXT = "line1";

setupExtension();

async function openSiteInput(site) {
  await browser.newWindow("about:blank", { type: "tab" });
  await browser.url(site.url);
  await browser.pause(site.requiresAuth ? 5000 : 3000);
  const input = await $(site.inputSelector);
  return (await input.isExisting()) ? input : null;
}

async function typeIntoInput(input, text) {
  await input.click();
  await browser.pause(300);
  await input.addValue(text);
  await browser.pause(300);
}

async function getInputContent(selector, inputType) {
  return browser.execute((inputSelector, type) => {
    const element = document.querySelector(inputSelector);
    if (!element) return "";
    if (type === "contenteditable") return element.innerText || element.textContent || "";
    return element.value || element.innerText || "";
  }, selector, inputType);
}

async function detectSubmission(site, inputContent) {
  await browser.pause(3000);
  const contentAfter = await getInputContent(site.inputSelector, site.inputType);
  const inputCleared = contentAfter.trim() === "" && inputContent.trim() !== "";
  const textInPage = await browser.execute((searchText) =>
    (document.body.innerText || "").split(searchText).length - 1, inputContent.trim());
  const textEchoed = textInPage >= 2 || (inputCleared && textInPage >= 1);
  const loadingSelectors = [
    '[class*="loading"]', '[class*="spinner"]', '[class*="typing"]',
    '[class*="generating"]', '[class*="thinking"]', '[class*="streaming"]',
    '[data-testid*="loading"]', 'svg[class*="animate"]',
  ];
  let hasLoading = false;
  for (const selector of loadingSelectors) {
    if (await $(selector).isExisting()) {
      hasLoading = true;
      break;
    }
  }
  const hasStopButton = await $('button[aria-label*="Stop"], button[aria-label*="stop"], button[class*="stop"]').isExisting();
  const signals = { inputCleared, textEchoed, hasLoading, hasStopButton };
  const submitted = Object.values(signals).some(Boolean);
  const reasons = Object.entries(signals).filter(([, value]) => value).map(([name]) => name);

  return {
    submitted,
    signals,
    reason: submitted
      ? `Submitted (${reasons.join(", ")})`
      : `NOT submitted — input: "${contentAfter.substring(0, 40)}"`,
  };
}

function screenshotPath(siteName, suffix) {
  return path.resolve(__dirname, "..", "screenshots", `${siteName.toLowerCase()}-${suffix}.png`);
}

function addSiteBehaviorTests(sites, authRequired) {
  for (const site of sites) {
    describe(site.name, () => {
      it("Enter inserts a newline without submitting", async function () {
        this.timeout(45000);
        const input = await openSiteInput(site);
        if (!input) {
          if (authRequired) {
            console.log(`  ⏭️ ${site.name}: Skipped — not logged in`);
            await browser.saveScreenshot(screenshotPath(site.name, "skipped"));
            this.skip();
          }
          throw new Error(`Input not found on ${site.name}`);
        }

        await typeIntoInput(input, NEWLINE_TEST_TEXT);
        const contentBefore = await getInputContent(site.inputSelector, site.inputType);
        await browser.keys("Enter");
        await browser.pause(1500);

        const contentAfter = await getInputContent(site.inputSelector, site.inputType);
        await browser.saveScreenshot(screenshotPath(site.name, "enter-result"));
        const wasSubmitted = contentAfter.trim() === "" && contentBefore.trim() !== "";

        console.log(`  ${site.name} Enter: "${contentBefore.replace(/\n/g, "\\n")}" → "${contentAfter.replace(/\n/g, "\\n")}"`);
        expect(wasSubmitted, `Enter should NOT submit on ${site.name}`).toBe(false);
      });

      it("Ctrl+Enter submits the message", async function () {
        this.timeout(45000);
        const input = await openSiteInput(site);
        if (!input) {
          if (authRequired) this.skip();
          throw new Error(`Input not found on ${site.name}`);
        }

        const uniqueText = `${TEST_TEXT}_${Date.now()}`;
        await typeIntoInput(input, uniqueText);
        const contentBefore = await getInputContent(site.inputSelector, site.inputType);
        await pressCtrlEnter();
        const result = await detectSubmission(site, contentBefore);
        await browser.saveScreenshot(screenshotPath(site.name, "ctrl-enter-result"));

        console.log(`  ${site.name} Ctrl+Enter: ${result.reason}`);
        console.log(`    Signals: ${JSON.stringify(result.signals)}`);
        expect(result.submitted, `Ctrl+Enter should submit on ${site.name}: ${result.reason}`).toBe(true);
      });
    });
  }
}

describe("Ctrl+Enter Behavior — Public Sites", () => {
  addSiteBehaviorTests(SITES.filter((site) => !site.requiresAuth), false);
});

describe("Ctrl+Enter Behavior — Auth Sites", () => {
  addSiteBehaviorTests(SITES.filter((site) => site.requiresAuth), true);
});

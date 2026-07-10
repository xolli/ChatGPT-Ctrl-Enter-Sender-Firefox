// Playwright fixtures for testing Chrome extensions.
// Uses launchPersistentContext to load the unpacked extension.
const { test: base, chromium } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const os = require("os");

const EXTENSION_PATH = path.resolve(__dirname, "..");

/**
 * Custom fixture that launches Chromium with the extension loaded.
 * Provides `context` (BrowserContext) and `extensionId` to each test.
 */
const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctrl-enter-test-"));

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-first-run",
        "--disable-gpu",
        // Stealth flags to avoid bot detection / CAPTCHA loops
        "--disable-blink-features=AutomationControlled",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
      viewport: { width: 1280, height: 720 },
    });

    try {
      await use(context);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  extensionId: async ({ context }, use) => {
    // Wait for service worker to register
    let serviceWorker;
    if (context.serviceWorkers().length > 0) {
      serviceWorker = context.serviceWorkers()[0];
    } else {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
});

module.exports = { test };

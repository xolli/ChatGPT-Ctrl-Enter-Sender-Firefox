const AdmZip = require("adm-zip");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { browser } = require("@wdio/globals");

const REPO_ROOT = path.resolve(__dirname, "..");
const PACKAGED_DIRS = ["_locales", "constants", "content", "icon", "options", "popup", "shared"];
const PACKAGED_FILES = ["service-worker.js", "manifest.json"];

let extension;
let bridgeServer;
let bridgeHandle;

function createTestExtension() {
  const extensionDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctrl-enter-extension-"));
  for (const dir of PACKAGED_DIRS) {
    fs.cpSync(path.join(REPO_ROOT, dir), path.join(extensionDir, dir), { recursive: true });
  }
  for (const file of PACKAGED_FILES) {
    fs.copyFileSync(path.join(REPO_ROOT, file), path.join(extensionDir, file));
  }

  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.content_scripts[0].matches.push("http://127.0.0.1/*");
  manifest.content_scripts[0].js.push("content/test-bootstrap.js");
  manifest.host_permissions.push("http://127.0.0.1/*");
  manifest.background.scripts.push("test-background.js");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(extensionDir, "content", "test-bootstrap.js"), `
function exposeTestExtensionUrl() {
  const marker = document.createElement("meta");
  marker.name = "ctrl-enter-test-extension-url";
  marker.content = browser.runtime.getURL("");
  (document.head || document.documentElement).appendChild(marker);
}
if (document.documentElement) {
  exposeTestExtensionUrl();
} else {
  document.addEventListener("DOMContentLoaded", exposeTestExtensionUrl, { once: true });
}
window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== "ctrl-enter-test-open-page") return;
  browser.runtime.sendMessage({
    type: "ctrl-enter-test-open-page",
    path: event.data.path,
    token: event.data.token,
  }).then((response) => {
    window.postMessage({ type: "ctrl-enter-test-open-page-result", ...response }, window.location.origin);
  });
});
`);
  fs.writeFileSync(path.join(extensionDir, "test-background.js"), `
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || message?.type !== "ctrl-enter-test-open-page") return;
  if (!["options/options.html", "popup/popup.html"].includes(message.path.split("?")[0])) return;
  const url = browser.runtime.getURL(message.path);
  return browser.tabs.create({ url }).then((tab) => ({ token: message.token, url, tabId: tab.id }));
});
`);

  for (const file of ["content/ctrl-enter-utils.js", "content/ctrl-enter-handler.js"]) {
    const sourcePath = path.join(extensionDir, file);
    const source = fs.readFileSync(sourcePath, "utf8");
    const testSource = source.replaceAll(
      "window.location.hostname",
      'new URLSearchParams(window.location.search).get("__ctrlEnterTestHostname") || window.location.hostname'
    );
    if (source === testSource) {
      throw new Error(`Could not add the test-host override to ${file}`);
    }
    fs.writeFileSync(sourcePath, testSource);
  }

  const popupPath = path.join(extensionDir, "popup", "popup.js");
  const popupSource = fs.readFileSync(popupPath, "utf8");
  // The test opens the popup as a tab, so bind it to the fixture's active host.
  const testPopupSource = popupSource.replace(
    "const hostname = extractHostname(currentTab.url);",
    'const hostname = "chatgpt.com";'
  );
  if (popupSource === testPopupSource) {
    throw new Error("Could not add the test-host override to popup/popup.js");
  }
  fs.writeFileSync(popupPath, testPopupSource);

  for (const file of ["content/ctrl-enter-utils.js", "content/ctrl-enter-handler.js"]) {
    const sourcePath = path.join(extensionDir, file);
    const source = fs.readFileSync(sourcePath, "utf8");
    const testSource = source.replaceAll(
      "window.location.href",
      'new URLSearchParams(window.location.search).get("__ctrlEnterTestUrl") || window.location.href'
    );
    fs.writeFileSync(sourcePath, testSource);
  }

  const xpiPath = path.join(extensionDir, "test-extension.xpi");
  const archive = new AdmZip();
  archive.addLocalFolder(extensionDir);
  archive.writeZip(xpiPath);
  return { extensionDir, xpiPath };
}

function setupExtension() {
  before(async () => {
    extension = createTestExtension();
    bridgeServer = await startFixtureServer(() => "<!doctype html><html><head></head><body></body></html>");
    const addon = fs.readFileSync(extension.xpiPath).toString("base64");
    await browser.installAddOn(addon, true);

    await browser.url(bridgeServer.url("chatgpt.com"));
    await browser.waitUntil(async () => browser.execute(() =>
      document.querySelector('meta[name="ctrl-enter-test-extension-url"]')?.content
    ), { timeout: 10000 });
    extension.url = (await browser.execute(() =>
      document.querySelector('meta[name="ctrl-enter-test-extension-url"]').content
    )).replace(/\/$/, "");
    bridgeHandle = await browser.getWindowHandle();
  });

  afterEach(async () => {
    const handles = await browser.getWindowHandles();
    if (!handles.includes(bridgeHandle)) throw new Error("The extension bridge tab was closed");
    for (const handle of handles.filter((handle) => handle !== bridgeHandle)) {
      await browser.switchToWindow(handle);
      await browser.closeWindow();
    }
    await browser.switchToWindow(bridgeHandle);
    await browser.url(bridgeServer.url("chatgpt.com"));
  });

  after(async () => {
    if (extension) {
      if (bridgeServer) await bridgeServer.close();
      fs.rmSync(extension.extensionDir, { recursive: true, force: true });
      extension = undefined;
      bridgeServer = undefined;
      bridgeHandle = undefined;
    }
  });
}

function extensionPage(pathname) {
  if (!extension?.url) throw new Error("The extension has not been installed");
  return `${extension.url}/${pathname}`;
}

async function openExtensionPage(pathname, { useCurrentPage = false } = {}) {
  if (!["options/options.html", "popup/popup.html"].includes(pathname)) {
    throw new Error(`Unsupported extension test page: ${pathname}`);
  }
  if (!useCurrentPage) {
    await browser.switchToWindow(bridgeHandle);
    await browser.url(bridgeServer.url("chatgpt.com"));
  }
  const token = `${Date.now()}-${Math.random()}`;
  const openedUrl = await browser.executeAsync((path, requestToken, done) => {
    const timeout = setTimeout(() => done(null), 10000);
    const onMessage = (event) => {
      if (event.source !== window ||
          event.data?.type !== "ctrl-enter-test-open-page-result" ||
          event.data.token !== requestToken) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      done(event.data.url);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({
      type: "ctrl-enter-test-open-page",
      path,
      token: requestToken,
    }, window.location.origin);
  }, pathname, token);
  if (!openedUrl) throw new Error(`The extension did not open ${pathname}`);

  let extensionHandle;
  await browser.waitUntil(async () => {
    const handles = await browser.getWindowHandles();
    for (const handle of handles) {
      await browser.switchToWindow(handle);
      if ((await browser.getUrl()) === openedUrl) {
        extensionHandle = handle;
        return true;
      }
    }
    return false;
  }, { timeout: 10000 });
  return extensionHandle;
}

async function extensionExecute(script, ...args) {
  return browser.execute(script, ...args);
}

async function extensionExecuteAsync(script, ...args) {
  return browser.executeAsync(script, ...args);
}

async function pressCtrlEnter() {
  const { Key } = require("webdriverio");
  await browser.action("key")
    .down(Key.Control)
    .down(Key.Enter)
    .up(Key.Enter)
    .up(Key.Control)
    .perform();
}

async function startFixtureServer(getHtml) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(getHtml(url));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    url(hostname, search = "") {
      const testUrl = {
        "m365.cloud.microsoft": "https://m365.cloud.microsoft/chat",
        "github.com": "https://github.com/copilot",
      }[hostname];
      return `http://127.0.0.1:${port}/${search}${search ? "&" : "?"}__ctrlEnterTestHostname=${encodeURIComponent(hostname)}${testUrl ? `&__ctrlEnterTestUrl=${encodeURIComponent(testUrl)}` : ""}`;
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

module.exports = {
  createTestExtension,
  extensionExecute,
  extensionExecuteAsync,
  extensionPage,
  openExtensionPage,
  pressCtrlEnter,
  setupExtension,
  startFixtureServer,
};

import { SITE_CONFIGS, OPTIONAL_SITE_CONFIGS, SUPPORTED_SITES, extractHostname } from "./constants/site-configs.js";

// ── Action icon visibility ───────────────────────────────────────────────────
// The action is disabled by default and shown declaratively on supported sites.
// declarativeContent needs no host access, so the icon stays clickable on
// optional sites even before the user grants the host permission (the popup is
// where they grant it).

function matchPatternToRegex(pattern) {
  return "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
}

const ACTION_RULE_REGEXES = SITE_CONFIGS.flatMap((config) => config.matchPatterns.map(matchPatternToRegex));

function getActionRules() {
  return new Promise((resolve) => chrome.declarativeContent.onPageChanged.getRules(resolve));
}

async function ensureActionRules() {
  chrome.action.disable();

  const rules = await getActionRules();
  const current = rules.flatMap((rule) => rule.conditions.map((c) => c.pageUrl?.urlMatches));
  const upToDate =
    current.length === ACTION_RULE_REGEXES.length &&
    ACTION_RULE_REGEXES.every((regex) => current.includes(regex));
  if (upToDate) return;

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: ACTION_RULE_REGEXES.map(
          (regex) => new chrome.declarativeContent.PageStateMatcher({ pageUrl: { urlMatches: regex } })
        ),
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
}

// ── Dynamic content scripts for optional sites ───────────────────────────────
// Optional sites are not in manifest content_scripts; their scripts are
// registered here once the user grants the host permission (see popup).

let _syncing = false;
async function syncOptionalContentScripts() {
  if (_syncing) return;
  _syncing = true;
  try {
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const registeredIds = new Set(registered.map((script) => script.id));

  for (const config of OPTIONAL_SITE_CONFIGS) {
    const granted = await chrome.permissions.contains({ origins: config.matchPatterns });
    if (granted && !registeredIds.has(config.hostname)) {
      await chrome.scripting.registerContentScripts([
        {
          id: config.hostname,
          matches: config.matchPatterns,
          js: ["content/ctrl-enter-utils.js", "content/ctrl-enter-handler.js"],
          runAt: "document_start",
        },
      ]);
    } else if (!granted && registeredIds.has(config.hostname)) {
      await chrome.scripting.unregisterContentScripts({ ids: [config.hostname] });
    }
  }
  } finally {
    _syncing = false;
  }
}

// Both operations are idempotent, so run them on every service worker start
// rather than relying on onInstalled/onStartup (which don't cover all the
// ways rules and registrations can get out of sync, e.g. unpacked loads).
ensureActionRules();
syncOptionalContentScripts();

// Notify user on update (useful for non-host_permissions changes)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    chrome.storage.local.set({ updatedFrom: details.previousVersion });
  }
});

// Covers grants/revocations from the popup, the options page, and the
// site-access controls in chrome://extensions.
chrome.permissions.onAdded.addListener(() => syncOptionalContentScripts());
chrome.permissions.onRemoved.addListener(() => syncOptionalContentScripts());

// Lets the popup/options page wait for registration before reloading the tab.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "sync-optional-sites") {
    syncOptionalContentScripts().then(() => sendResponse(true));
    return true;
  }
});

// ── Per-tab icon state on supported sites ────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // tab.url is unavailable on sites we have no host permission for
  // (e.g. optional sites not yet granted); leave those to declarativeContent
  const url = tab.url;
  if (!url) return;

  const hostname = extractHostname(url);
  if (!SUPPORTED_SITES.includes(hostname)) {
    chrome.action.disable(tabId);
    return;
  }

  if (changeInfo.status === "complete") {
    chrome.storage.sync.get("siteSettings", (data) => {
      const siteSettings = data.siteSettings || {};
      const isEnabled = siteSettings[hostname] ?? true;

      chrome.action.setIcon({ tabId, path: isEnabled ? "icon/enabled.png" : "icon/disabled.png" });
      chrome.action.enable(tabId);
    });
  }
});

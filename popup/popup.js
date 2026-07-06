import { SITE_CONFIGS, extractHostname } from "../constants/site-configs.js";

const toggleSection = document.querySelector("#toggleSection");
const grantSection = document.querySelector("#grantSection");
const unsupportedSection = document.querySelector("#unsupportedSection");
const toggleButton = document.querySelector("#isEnabled");
const grantButton = document.querySelector("#grantButton");

let currentTab = null;
let currentConfig = null;

// activeTab makes tab.url readable here even on sites without a granted
// host permission (opening the popup counts as invoking the extension)
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  currentTab = tabs[0];
  const hostname = extractHostname(currentTab.url);
  currentConfig = SITE_CONFIGS.find((c) => c.hostname === hostname) ?? null;

  if (!currentConfig) {
    unsupportedSection.hidden = false;
    return;
  }

  if (currentConfig.optional) {
    chrome.permissions.contains({ origins: currentConfig.matchPatterns }, (granted) => {
      if (granted) {
        showToggle();
      } else {
        grantSection.hidden = false;
      }
    });
  } else {
    showToggle();
  }
});

function showToggle() {
  grantSection.hidden = true;
  toggleSection.hidden = false;

  chrome.storage.sync.get("siteSettings", (data) => {
    const siteSettings = data.siteSettings || {};
    const isEnabled = siteSettings[currentConfig.hostname] ?? true;
    toggleButton.checked = isEnabled;
    updateIcon(isEnabled, currentTab.id);
  });
}

toggleButton.addEventListener("change", () => {
  const isEnabled = toggleButton.checked;

  chrome.storage.sync.get("siteSettings", (data) => {
    const siteSettings = data.siteSettings || {};
    siteSettings[currentConfig.hostname] = isEnabled;
    chrome.storage.sync.set({ siteSettings }, () => {
      updateIcon(isEnabled, currentTab.id);
    });
  });
});

grantButton.addEventListener("click", () => {
  chrome.permissions.request({ origins: currentConfig.matchPatterns }, (granted) => {
    if (!granted) return;
    // Wait for the background to register the content script, then reload
    // the page so it takes effect immediately
    chrome.runtime.sendMessage({ type: "sync-optional-sites" }, () => {
      chrome.tabs.reload(currentTab.id);
      showToggle();
    });
  });
});

function updateIcon(enabled, tabId) {
  chrome.action.setIcon({ tabId, path: enabled ? "../icon/enabled.png" : "../icon/disabled.png" });
  chrome.action.enable(tabId);
}

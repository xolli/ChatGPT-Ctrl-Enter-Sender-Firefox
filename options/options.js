import { SITE_CONFIGS, SUPPORTED_SITES } from "../constants/site-configs.js";

const siteList = document.getElementById("siteList");
const selectAllCheckbox = document.getElementById("selectAll");
const saveButton = document.getElementById("saveButton");

// Optional sites need a host permission granted by the user before their
// content script can run; ungranted ones get an "Allow access" button instead
// of a usable checkbox.
async function getUngrantedOptionalSites() {
  const ungranted = new Set();
  for (const config of SITE_CONFIGS) {
    if (!config.optional) continue;
    const granted = await chrome.permissions.contains({ origins: config.matchPatterns });
    if (!granted) ungranted.add(config.hostname);
  }
  return ungranted;
}

// Render checkbox list based on the SITE_CONFIGS array
function renderCheckboxes(savedSettings, ungrantedSites) {
  siteList.innerHTML = '';
  SITE_CONFIGS.forEach((config) => {
    const hostname = config.hostname;
    const needsGrant = ungrantedSites.has(hostname);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = hostname;
    checkbox.checked = !needsGrant && (savedSettings[hostname] ?? true);
    checkbox.disabled = needsGrant;

    const label = document.createElement("label");
    label.className = "site-label";
    label.appendChild(checkbox);
    label.append(` https://${hostname}`);

    if (needsGrant) {
      const grantButton = document.createElement("button");
      grantButton.type = "button";
      grantButton.className = "grant-button";
      grantButton.textContent = "Allow access";
      grantButton.addEventListener("click", () => {
        chrome.permissions.request({ origins: config.matchPatterns }, (granted) => {
          if (!granted) return;
          // Let the background register the content script, then re-render
          chrome.runtime.sendMessage({ type: "sync-optional-sites" }, loadSettings);
        });
      });
      label.appendChild(grantButton);
    }

    siteList.appendChild(label);
  });
}

// Save settings to chrome.storage
function saveSettings() {
  const settings = {};
  SUPPORTED_SITES.forEach((hostname) => {
    const checkbox = document.getElementById(hostname);
    if (checkbox.disabled) return; // permission not granted; nothing to save
    settings[hostname] = checkbox.checked;
  });

  chrome.storage.sync.set({ siteSettings: settings }, () => {
    const originalText = saveButton.textContent;
    saveButton.textContent = "Saved!";
    saveButton.disabled = true;
    setTimeout(() => {
      saveButton.textContent = originalText;
      saveButton.disabled = false;
    }, 500);
  });
}

// Handle Select All checkbox
selectAllCheckbox.addEventListener("change", () => {
  const allChecked = selectAllCheckbox.checked;
  SUPPORTED_SITES.forEach((hostname) => {
    const checkbox = document.getElementById(hostname);
    if (checkbox && !checkbox.disabled) checkbox.checked = allChecked;
  });
});

// Save button click
saveButton.addEventListener("click", saveSettings);

// Load saved settings on page load
async function loadSettings() {
  const ungrantedSites = await getUngrantedOptionalSites();
  chrome.storage.sync.get("siteSettings", (data) => {
    renderCheckboxes(data.siteSettings || {}, ungrantedSites);
  });
}

loadSettings();

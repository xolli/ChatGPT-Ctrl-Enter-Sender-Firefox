const { expect } = require("@wdio/globals");
const { pressCtrlEnter, setupExtension, startFixtureServer } = require("./wdio-helpers");

const MOCK_SITES = [
  {
    name: "ChatGPT",
    hostname: "chatgpt.com",
    markup: '<div id="prompt-textarea" contenteditable="true" role="textbox"></div>',
    inputSelector: "#prompt-textarea",
  },
  {
    name: "ChatGPT markdown composer",
    hostname: "chatgpt.com",
    markup: '<form data-chatgpt-composer><div class="ProseMirror" contenteditable="true" role="textbox" data-composer-markdown></div><button type="submit" aria-label="Send"></button></form>',
    inputSelector: "[data-composer-markdown]",
    submitViaButton: true,
    backgroundShortcut: true,
  },
  {
    name: "Claude",
    hostname: "claude.ai",
    markup: '<div id="prompt" contenteditable="true" role="textbox"></div>',
    inputSelector: "#prompt",
  },
  {
    name: "Gemini",
    hostname: "gemini.google.com",
    markup: '<div id="prompt" class="ql-editor" contenteditable="true" role="textbox"></div>',
    inputSelector: "#prompt",
  },
  {
    name: "Copilot",
    hostname: "copilot.microsoft.com",
    markup: '<textarea id="prompt"></textarea>',
    inputSelector: "#prompt",
  },
  {
    name: "Microsoft 365 Copilot",
    hostname: "m365.cloud.microsoft",
    markup: '<div id="m365-chat-editor-target-element" contenteditable="true" role="textbox"></div>',
    inputSelector: "#m365-chat-editor-target-element",
  },
  {
    name: "DeepSeek",
    hostname: "chat.deepseek.com",
    markup: '<textarea id="prompt"></textarea>',
    inputSelector: "#prompt",
  },
  {
    name: "Grok",
    hostname: "grok.com",
    markup: '<textarea id="prompt"></textarea>',
    inputSelector: "#prompt",
  },
  {
    name: "Perplexity",
    hostname: "www.perplexity.ai",
    markup: '<div id="ask-input" contenteditable="true" role="textbox"></div>',
    inputSelector: "#ask-input",
  },
  {
    name: "Mistral",
    hostname: "chat.mistral.ai",
    markup: '<div id="prompt" class="ProseMirror" contenteditable="true" role="textbox"></div>',
    inputSelector: "#prompt",
  },
  {
    name: "GitHub Copilot",
    hostname: "github.com",
    markup: '<textarea id="prompt"></textarea>',
    inputSelector: "#prompt",
  },
  {
    name: "Poe",
    hostname: "poe.com",
    markup: '<textarea id="prompt"></textarea>',
    inputSelector: "#prompt",
  },
  {
    name: "v0",
    hostname: "v0.app",
    markup: '<textarea id="prompt"></textarea>',
    inputSelector: "#prompt",
  },
];

function createSiteFixture(site) {
  return `<!doctype html>
<html>
<body>
  ${site.markup}
  <script>
    const input = document.querySelector(${JSON.stringify(site.inputSelector)});
    const submitViaButton = ${Boolean(site.submitViaButton)};
    window.fixtureState = { submitCount: 0, backgroundCount: 0 };

    if (${Boolean(site.backgroundShortcut)}) {
      input.addEventListener("focus", () => {
        window.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" || !event.ctrlKey) return;
          event.preventDefault();
          window.fixtureState.backgroundCount += 1;
        }, true);
      }, { once: true });
    }

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (event.shiftKey) {
        event.preventDefault();
        if (input instanceof HTMLTextAreaElement) input.value += "\\n";
        else input.textContent += "\\n";
      } else if (!submitViaButton && !event.defaultPrevented) {
        event.preventDefault();
        window.fixtureState.submitCount += 1;
      }
    });

    const submitButton = document.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.addEventListener("click", (event) => {
        event.preventDefault();
        window.fixtureState.submitCount += 1;
      });
    }
  </script>
</body>
</html>`;
}

setupExtension();

let fixtureServer;

before(async () => {
  fixtureServer = await startFixtureServer((url) => {
    const siteName = url.searchParams.get("site");
    if (!siteName) return "<!doctype html><html><body></body></html>";
    const site = MOCK_SITES.find((entry) => entry.name === siteName);
    if (!site) throw new Error(`Unknown mock site: ${siteName}`);
    return createSiteFixture(site);
  });
});

after(async () => {
  await fixtureServer.close();
});

describe("Mock sites", () => {
  for (const site of MOCK_SITES) {
    it(`${site.name} maps Enter to newline and Ctrl+Enter to one submit`, async () => {
      const search = `?site=${encodeURIComponent(site.name)}`;
      await browser.url(fixtureServer.url(site.hostname, search));

      const input = await $(site.inputSelector);
      await input.click();
      await browser.keys("Enter");

      await browser.waitUntil(async () => {
        const content = await browser.execute((selector) => {
          const element = document.querySelector(selector);
          return element instanceof HTMLTextAreaElement ? element.value : element.textContent;
        }, site.inputSelector);
        return content.includes("\n");
      });
      expect(await browser.execute(() => window.fixtureState.submitCount)).toBe(0);

      await pressCtrlEnter();
      await browser.waitUntil(async () =>
        (await browser.execute(() => window.fixtureState.submitCount)) === 1
      );
      expect(await browser.execute(() => window.fixtureState.backgroundCount)).toBe(0);
    });
  }
});

/**
 * Opens sites in Firefox so login sessions persist in `test-user-data/`.
 *
 * Usage:
 *   node tests/login-helper.js
 *   node tests/login-helper.js ChatGPT
 *   node tests/login-helper.js Claude Gemini
 */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { remote } = require("webdriverio");
const geckodriver = require("geckodriver");
const { waitForPort } = require("./geckodriver");

const AUTH_SITES = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
  { name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { name: "Poe", url: "https://poe.com/" },
  { name: "Mistral", url: "https://chat.mistral.ai/chat" },
  { name: "NotebookLM", url: "https://notebook.google.com/" },
];

function askUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const requestedSites = args.length
    ? AUTH_SITES.filter((site) => args.some((arg) => site.name.toLowerCase().includes(arg.toLowerCase())))
    : AUTH_SITES;

  if (!requestedSites.length) {
    console.log("No matching sites found. Available sites:");
    AUTH_SITES.forEach((site) => console.log(`  - ${site.name}`));
    process.exitCode = 1;
    return;
  }

  const userDataDir = path.join(__dirname, "..", "test-user-data");
  fs.mkdirSync(userDataDir, { recursive: true });
  console.log("\n=== Firefox Login Helper ===");
  console.log(`Profile: ${userDataDir}`);
  console.log(`Sites: ${requestedSites.map((site) => site.name).join(", ")}\n`);

  const driver = await geckodriver.start({
    host: "127.0.0.1",
    port: 4444,
    spawnOpts: {
      stdio: "ignore",
      env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
    },
  });
  let firefox;
  try {
    await waitForPort(4444);
    firefox = await remote({
      hostname: "127.0.0.1",
      port: 4444,
      capabilities: {
        browserName: "firefox",
        acceptInsecureCerts: true,
        "moz:firefoxOptions": {
          args: ["-profile", userDataDir],
          ...(process.env.FIREFOX_BINARY ? { binary: process.env.FIREFOX_BINARY } : {}),
        },
      },
    });

    for (const site of requestedSites) {
      console.log(`\n--- ${site.name} ---\nOpening: ${site.url}`);
      await firefox.url(site.url);
      console.log(`\n  Please log in to ${site.name} in Firefox.`);
      console.log('  Complete any CAPTCHA / "are you human" checks.');
      await askUser(`  Press Enter when done with ${site.name}... `);
      console.log(`  ${site.name} session saved.`);
    }
  } finally {
    try {
      if (firefox) await firefox.deleteSession();
    } finally {
      if (driver.exitCode === null) {
        const exited = new Promise((resolve) => driver.once("exit", resolve));
        driver.kill();
        await exited;
      }
    }
  }

  console.log("\n=== All done! ===");
  console.log("Sessions have been saved. Run `npm run test:behavior` to test them.");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});

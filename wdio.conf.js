const { startGeckodriver, stopGeckodriver } = require("./tests/geckodriver");

exports.config = {
  runner: "local",
  specs: ["./tests/*.spec.js"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  capabilities: [{
    browserName: "firefox",
    pageLoadStrategy: "eager",
    acceptInsecureCerts: true,
    "moz:firefoxOptions": {
      args: process.env.HEADLESS === "false" ? [] : ["-headless"],
      ...(process.env.FIREFOX_BINARY ? { binary: process.env.FIREFOX_BINARY } : {}),
      prefs: {
        "browser.shell.checkDefaultBrowser": false,
        "browser.startup.page": 0,
        "browser.aboutwelcome.enabled": false,
      },
    },
  }],
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 60000,
    ui: "bdd",
  },
  onPrepare: startGeckodriver,
  onComplete: stopGeckodriver,
};

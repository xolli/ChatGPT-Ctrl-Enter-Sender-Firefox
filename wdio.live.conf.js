const { config } = require("./wdio.conf");
const fs = require("node:fs");
const path = require("node:path");

const userDataDir = path.resolve(__dirname, "test-user-data");
fs.mkdirSync(userDataDir, { recursive: true });

exports.config = {
  ...config,
  specs: ["./tests/live/*.spec.js"],
  capabilities: [{
    ...config.capabilities[0],
    "moz:firefoxOptions": {
      ...config.capabilities[0]["moz:firefoxOptions"],
      args: [
        ...(config.capabilities[0]["moz:firefoxOptions"].args || []),
        "-profile",
        userDataDir,
      ],
    },
  }],
  mochaOpts: {
    ...config.mochaOpts,
    timeout: 90000,
  },
};

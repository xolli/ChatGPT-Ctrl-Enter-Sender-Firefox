const net = require("node:net");
const geckodriver = require("geckodriver");

let processHandle;

async function waitForPort(port) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const listening = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (listening) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Geckodriver did not start listening on port ${port}`);
}

async function startGeckodriver() {
  // Firefox requires this opt-in for WebDriver to inspect moz-extension pages.
  processHandle = await geckodriver.start({
    host: "127.0.0.1",
    port: 4444,
    spawnOpts: {
      stdio: "ignore",
      env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
    },
  });
  await waitForPort(4444);
}

async function stopGeckodriver() {
  if (processHandle && processHandle.exitCode === null) {
    const exited = new Promise((resolve) => processHandle.once("exit", resolve));
    processHandle.kill();
    await exited;
  }
}

module.exports = { startGeckodriver, stopGeckodriver, waitForPort };

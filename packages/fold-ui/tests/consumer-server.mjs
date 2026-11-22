// The consumer check's SSR server, shared by the Chromium smoke (consumer-smoke.mjs) and the
// scrolling suite (consumer-scrolling.mjs): the built app's server on a free local port.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

async function freePort() {
  const server = createServer();

  await new Promise((done) => server.listen(0, "127.0.0.1", done));

  const { port } = server.address();

  await new Promise((done) => server.close(done));

  return port;
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    assert.equal(server.exitCode, null, "the SSR server exited");

    try {
      const response = await fetch(url);

      if (response.ok) {
        return response.text();
      }
    } catch {
      // Not listening yet.
    }

    await new Promise((done) => setTimeout(done, 200));
  }

  throw new Error(`${url} didn't respond within 30 s`);
}

/**
 * Starts the app's built SSR server. `ready` resolves to the server-rendered page once it answers;
 * kill `server` when done.
 */
export async function startServer(app) {
  const port = await freePort();
  const base = `http://localhost:${port}/`;
  const server = spawn("node", [join(app, "dist/consumer/server/server.mjs")], {
    env: { ...process.env, PORT: String(port), NG_ALLOWED_HOSTS: "localhost" },
    stdio: ["ignore", "inherit", "inherit"],
  });

  return { base, server, ready: waitForServer(base, server) };
}

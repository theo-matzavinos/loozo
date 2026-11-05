import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { defineContext, defineRpc } from "../dist/server/index.js";
import { handleRpc } from "../dist/server/generated.js";

const id = "checks";
const registry = {
  [id]: defineRpc(id, ({ query }) => ({ read: query({ handler: () => "read" }) })),
};

let contexts = 0;

const application = {
  id: "launch-http-checks-test-app",
  context: defineContext(() => {
    contexts += 1;

    return {};
  }),
};

const forbidden = {
  error: { code: "FORBIDDEN", message: "RPC forbidden", data: null },
};
const invalidInput = {
  error: { code: "INVALID_INPUT", message: "Invalid RPC input", data: { issues: [] } },
};

/** Calls `/_rpc/checks/read` on `url`'s origin with a valid JSON body unless overridden. */
async function call(
  url,
  options,
  { method = "POST", headers = {}, path = `/_rpc/${id}/read` } = {},
) {
  const init = { method, headers: { "content-type": "application/json", ...headers } };

  if (method === "POST") {
    init.body = '{"input":null}';
  }

  const logs = [];
  const previous = console.error;

  console.error = (...args) => {
    logs.push(args.join(" "));
  };

  try {
    const before = contexts;
    const response = await handleRpc(
      registry,
      application,
      new Request(`${url}${path}`, init),
      options,
    );

    return { response, contexts: contexts - before, logs };
  } finally {
    console.error = previous;
  }
}

test("hosts are matched exactly, by *.domain for subdomains only, or by *; others get a plain-text 400", async () => {
  const sameOrigin = { "sec-fetch-site": "same-origin" };

  for (const [url, allowedHosts, allowed] of [
    ["https://app.example.com", ["app.example.com"], true],
    ["https://other.example.com", ["app.example.com"], false],
    ["https://app.example.com", ["*.example.com"], true],
    ["https://a.b.example.com", ["*.example.com"], true],
    ["https://example.com", ["*.example.com"], false],
    ["https://badexample.com", ["*.example.com"], false],
    ["https://anything.test", ["*"], true],
    ["http://127.0.0.1:4000", ["127.0.0.1"], true],
    ["http://localhost", [], false],
  ]) {
    const { response, contexts, logs } = await call(url, { allowedHosts }, { headers: sameOrigin });
    const label = `${url} with [${allowedHosts.join(", ")}]`;

    if (allowed) {
      assert.equal(response.status, 200, label);
      assert.equal(await response.json(), "read", label);
      assert.equal(contexts, 1, label);

      continue;
    }

    const hostname = new URL(url).hostname;

    assert.equal(response.status, 400, label);
    assert.equal(response.headers.get("content-type"), "text/plain", label);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", label);
    assert.equal(await response.text(), "Host not allowed", label);
    assert.equal(contexts, 0, label);
    assert.equal(logs.length, 1, label);
    assert.match(logs[0], new RegExp(hostname.replaceAll(".", "\\.")), label);
  }
});

test("only requests proven same-origin pass: Sec-Fetch-Site first, then Origin, else refused", async () => {
  const own = "https://app.example.com";
  const options = { allowedHosts: ["app.example.com"], origins: ["https://public.example.com"] };

  for (const [headers, allowed] of [
    [{ "sec-fetch-site": "same-origin" }, true],
    [{ "sec-fetch-site": "same-origin", origin: own }, true],
    [{ "sec-fetch-site": "same-site" }, false],
    [{ "sec-fetch-site": "cross-site" }, false],
    [{ "sec-fetch-site": "none" }, false],
    [{ "sec-fetch-site": "unexpected" }, false],
    // Sec-Fetch-Site decides when sent, even with the app's own Origin.
    [{ "sec-fetch-site": "cross-site", origin: own }, false],
    [{ origin: own }, true],
    [{ origin: "https://evil.example" }, false],
    [{ origin: "http://app.example.com" }, false],
    [{ origin: "null" }, false],
    [{}, false],
    // No Referer fallback.
    [{ referer: `${own}/todos` }, false],
    // A listed origin passes even when the browser calls it cross-site.
    [{ "sec-fetch-site": "cross-site", origin: "https://public.example.com" }, true],
    [{ origin: "https://public.example.com" }, true],
    [{ "sec-fetch-site": "cross-site", origin: "https://other.example.com" }, false],
  ]) {
    const { response, contexts, logs } = await call(own, options, { headers });
    const label = JSON.stringify(headers);

    if (allowed) {
      assert.equal(response.status, 200, label);
      assert.equal(contexts, 1, label);

      continue;
    }

    assert.equal(response.status, 403, label);
    assert.deepEqual(await response.json(), forbidden, label);
    assert.equal(response.headers.get("content-type"), "application/json", label);
    assert.equal(contexts, 0, label);
    assert.equal(logs.length, 1, label);
    assert.match(logs[0], /cross-origin RPC/, label);
  }

  const { response } = await call(
    own,
    { allowedHosts: ["app.example.com"] },
    {
      headers: { "sec-fetch-site": "cross-site", origin: "https://public.example.com" },
    },
  );

  assert.equal(response.status, 403, "origins defaults to none");
});

test("checks run in order: path, host, method/media/query, origin, then context", async () => {
  const options = { allowedHosts: ["app.example.com"] };
  const crossSite = { "sec-fetch-site": "cross-site" };

  const page = await call("https://evil.example", options, {
    method: "GET",
    headers: crossSite,
    path: "/todos",
  });

  assert.equal(page.response, null, "non-RPC paths are left to the caller, whatever the host");

  for (const [label, request] of [
    ["malformed", { method: "GET", headers: crossSite }],
    ["cross-site", { headers: crossSite }],
    ["query string", { path: `/_rpc/${id}/read?x=1` }],
  ]) {
    const { response, contexts } = await call("https://evil.example", options, request);

    assert.equal(response.status, 400, label);
    assert.equal(await response.text(), "Host not allowed", label);
    assert.equal(contexts, 0, label);
  }

  for (const [label, request] of [
    ["bad method", { method: "GET", headers: crossSite }],
    ["bad media type", { headers: { ...crossSite, "content-type": "text/plain" } }],
    ["query string", { headers: crossSite, path: `/_rpc/${id}/read?x=1` }],
  ]) {
    const { response, contexts } = await call("https://app.example.com", options, request);

    assert.equal(response.status, 400, label);
    assert.deepEqual(await response.json(), invalidInput, label);
    assert.equal(contexts, 0, label);
  }

  const missing = await call("https://app.example.com", options, {
    headers: crossSite,
    path: `/_rpc/${id}/absent`,
  });

  assert.equal(missing.response.status, 403, "a cross-site call is refused before lookup");
  assert.equal(missing.contexts, 0);
});

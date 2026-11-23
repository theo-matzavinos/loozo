// Remembered search keys against one built server: searchCookies() on the page response and in
// the browser, and rpcNavigationErrors' retry without a restored value. verify.mjs runs it
// against the verification build and the verification-development build, where Angular's
// development checks run. Each row enters twice; the second entry sends the cookies the first
// left. Then Chromium enters by document and by client navigation.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const deletion = (name) =>
  `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax`;
const pageSize = "search.todos.pageSize";
const filter = "search.todos.filter";
const density = "search.layout.density";

// A cookie jar for Node's fetch: request cookies by name, updated by Set-Cookie values.
function jar(cookies) {
  const values = new Map(Object.entries(cookies));

  return {
    header() {
      const pairs = [];

      for (const [name, value] of values) {
        pairs.push(`${name}=${value}`);
      }

      return pairs.join("; ");
    },
    update(setCookies) {
      for (const cookie of setCookies) {
        const [pair] = cookie.split(";");
        const separator = pair.indexOf("=");
        const name = pair.slice(0, separator);

        if (/Max-Age=0/.test(cookie)) {
          values.delete(name);
        } else {
          values.set(name, pair.slice(separator + 1));
        }
      }
    },
    has: (name) => values.has(name),
  };
}

function rememberedCookies(setCookies) {
  const result = [];

  for (const cookie of setCookies) {
    if (cookie.startsWith("search.")) {
      result.push(cookie);
    }
  }

  return result;
}

function view(text) {
  return /<p id="view">([\s\S]*?)<\/p>/.exec(text)?.[1].replace(/\s+/g, " ").trim();
}

export async function verifyRemembered({ base, build, browser, evidence, checks }) {
  const label = (text) => `${build}: ${text}`;
  const responses = [];

  async function filterInputs() {
    const stats = await (await fetch(`${base}/__proof/stats`)).json();

    return stats.filterInputs.length;
  }

  // The page request through the server's Node writer, without following redirects.
  async function enter(path, cookies) {
    const before = await filterInputs();
    const response = await fetch(`${base}${path}`, {
      redirect: "manual",
      headers: { cookie: cookies.header() },
    });
    const text = await response.text();
    const stats = await (await fetch(`${base}/__proof/stats`)).json();
    const entry = {
      path,
      status: response.status,
      location: response.headers.get("location"),
      setCookies: response.headers.getSetCookie(),
      bytes: text.length,
      view: view(text),
      notFound: text.includes('<h1 id="not-found-title">Not found</h1>'),
      filterInputs: stats.filterInputs.slice(before),
    };

    responses.push(entry);
    cookies.update(entry.setCookies);

    return entry;
  }

  // Restore: a bare entry redirects to the remembered URL, with the RPC cookie on that 302.
  const restoring = jar({ "proof-user": "alice", [pageSize]: "50" });

  for (const time of [1, 2]) {
    const first = await enter("/todos", restoring);

    assert.equal(first.status, 302);
    assert.equal(first.location, "/todos?pageSize=50");
    assert.equal(first.bytes, 0);
    assert.equal(first.setCookies.length, 1, `entry ${time}`);
    assert.match(first.setCookies[0], /^proof-seen=\d+; /);

    const restored = await enter(first.location, restoring);

    assert.equal(restored.status, 200);
    assert.equal(restored.view, "All · 50 per page · comfortable");
    assert.deepEqual(rememberedCookies(restored.setCookies), []);
  }

  // A page size the list doesn't offer, typed or remembered, reads as 20 and isn't remembered.
  const typedSize = jar({ "proof-user": "alice", [pageSize]: "50" });
  const zero = await enter("/todos?pageSize=0", typedSize);

  assert.equal(zero.status, 200);
  assert.equal(zero.view, "All · 20 per page · comfortable");
  assert.deepEqual(rememberedCookies(zero.setCookies), [deletion(pageSize)]);

  const storedSize = jar({ "proof-user": "alice", [pageSize]: "0" });

  for (const time of [1, 2]) {
    const bare = await enter("/todos", storedSize);

    assert.equal(bare.status, 200, `entry ${time}`);
    assert.equal(bare.location, null, `entry ${time}`);
    assert.equal(bare.view, "All · 20 per page · comfortable", `entry ${time}`);

    if (time === 1) {
      assert.deepEqual(rememberedCookies(bare.setCookies), [deletion(pageSize)]);
    } else {
      assert.deepEqual(rememberedCookies(bare.setCookies), []);
    }
  }

  checks.push(
    label(
      "an unsupported page size, typed (?pageSize=0) or remembered, renders 20 per page and deletes the remembered cookie, so the next bare /todos stays at 20",
    ),
  );

  checks.push(
    label(
      "a bare /todos with a remembered page size answers 302 to /todos?pageSize=50 with the RPC's cookie and no remembered cookie written again, then renders 50; the same on a second entry",
    ),
  );

  // A restored filter the handler no longer knows: one retry inside the render, 200.
  const stale = jar({ "proof-user": "alice", [filter]: "archived", unrelated: "keep" });
  const recovered = await enter("/todos?origin=kept", stale);

  assert.equal(recovered.status, 200);
  assert.equal(recovered.location, null);
  assert.equal(recovered.view, "All · 20 per page · comfortable");
  assert.deepEqual(recovered.filterInputs, ["archived", "all"]);
  assert.deepEqual(rememberedCookies(recovered.setCookies), [deletion(filter)]);
  assert.ok(recovered.setCookies.some((cookie) => cookie.startsWith("proof-seen=")));
  assert.ok(stale.has("unrelated") && stale.has("proof-user") && !stale.has(filter));

  const after = await enter("/todos?origin=kept", stale);

  assert.equal(after.status, 200);
  assert.equal(after.view, "All · 20 per page · comfortable");
  assert.deepEqual(after.filterInputs, ["all"]);
  assert.deepEqual(rememberedCookies(after.setCookies), []);
  checks.push(
    label(
      "a remembered filter the todos.filter handler refuses (validated input archived, then all) answers 200 at /todos?origin=kept with the fallback, no Location, one deletion and the RPC's cookie; the next entry restores nothing",
    ),
  );

  // Two owners: the layout's density and the page's filter are both forgotten.
  const both = jar({ "proof-user": "alice", [density]: "compact", [filter]: "archived" });
  const recoveredBoth = await enter("/todos?origin=kept", both);

  assert.equal(recoveredBoth.status, 200);
  assert.equal(recoveredBoth.location, null);
  assert.equal(recoveredBoth.view, "All · 20 per page · comfortable");
  assert.deepEqual(rememberedCookies(recoveredBoth.setCookies), [
    deletion(density),
    deletion(filter),
  ]);

  const afterBoth = await enter("/todos?origin=kept", both);

  assert.equal(afterBoth.status, 200);
  assert.deepEqual(afterBoth.filterInputs, ["all"]);
  assert.deepEqual(rememberedCookies(afterBoth.setCookies), []);
  checks.push(
    label(
      "a page restoring the layout's density and a stale filter answers 200 at both fallbacks with both deletions; the next entry restores nothing",
    ),
  );

  // A page missing anyway: one retry, then the ordinary not-found, at the requested URL.
  const missing = jar({ "proof-user": "alice", [density]: "compact" });
  const notFound = await enter("/todo/42?origin=kept", missing);

  assert.equal(notFound.status, 404);
  assert.equal(notFound.location, null);
  assert.ok(notFound.notFound && notFound.bytes > 0);
  assert.deepEqual(rememberedCookies(notFound.setCookies), [deletion(density)]);

  const notFoundAgain = await enter("/todo/42?origin=kept", missing);

  assert.equal(notFoundAgain.status, 404);
  assert.equal(notFoundAgain.location, null);
  assert.ok(notFoundAgain.notFound);
  assert.deepEqual(rememberedCookies(notFoundAgain.setCookies), []);
  checks.push(
    label(
      "a missing todo entered with a remembered density renders the not-found page with 404 at the requested URL, no Location, and the density's deletion; the next entry is the same 404 without a deletion",
    ),
  );

  // A redirect keeps remembered values.
  const signedOut = jar({ [pageSize]: "50" });

  for (const time of [1, 2]) {
    const redirected = await enter("/todos", signedOut);

    assert.equal(redirected.status, 302, `entry ${time}`);
    assert.equal(redirected.location, "/sign-in");
    assert.deepEqual(rememberedCookies(redirected.setCookies), []);
    assert.ok(signedOut.has(pageSize));
  }

  checks.push(
    label("a signed-out /todos with a remembered page size answers 302 to /sign-in and keeps it"),
  );

  // Controls: without a restore, a not-found is the ordinary rendered 404 and nothing is forgotten.
  const explicit = jar({ "proof-user": "alice", [filter]: "open" });
  const explicitMissing = await enter("/todos?filter=archived", explicit);

  assert.equal(explicitMissing.status, 404);
  assert.equal(explicitMissing.location, null);
  assert.ok(explicitMissing.notFound);
  assert.deepEqual(explicitMissing.filterInputs, ["archived"]);
  assert.deepEqual(rememberedCookies(explicitMissing.setCookies), []);

  const plainMissing = await enter("/todo/42", jar({ "proof-user": "alice" }));

  assert.equal(plainMissing.status, 404);
  assert.equal(plainMissing.location, null);
  assert.ok(plainMissing.notFound);
  assert.deepEqual(plainMissing.setCookies, []);
  checks.push(
    label(
      "an explicit ?filter=archived and a missing todo without remembered cookies render the ordinary 404 once, keeping the stored filter",
    ),
  );

  await writeFile(
    join(evidence, `remembered-${build}-http.json`),
    JSON.stringify(responses, null, 2),
  );
  await verifyInBrowser({ base, build, browser, evidence, checks, label });
}

async function verifyInBrowser({ base, build, browser, evidence, checks, label }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems = [];
  const calls = [];

  page.on("pageerror", (error) => problems.push(`pageerror: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error" && /NG0|hydrat/i.test(message.text())) {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("response", async (response) => {
    const path = new URL(response.url()).pathname;

    if (path.startsWith("/_rpc/")) {
      calls.push({ path, status: response.status(), body: response.request().postData() });
    }
  });
  // Records every view and not-found the page shows, from the first parse on.
  await context.addInitScript(() => {
    globalThis.__proofShown = [];

    new MutationObserver(() => {
      const shown = [
        document.getElementById("view")?.textContent.replace(/\s+/g, " ").trim(),
        document.getElementById("not-found-title")?.textContent,
      ].join("|");

      if (shown !== "|" && globalThis.__proofShown.at(-1) !== shown) {
        globalThis.__proofShown.push(shown);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });

  // The view line, or undefined on a page without one, such as not-found or sign-in.
  function shownView() {
    return page.evaluate(() =>
      document.getElementById("view")?.textContent.replace(/\s+/g, " ").trim(),
    );
  }

  // Every cookie of the context: one origin, and Playwright leaves Secure cookies out of a
  // listing for an http URL.
  async function remembered() {
    const result = {};

    for (const cookie of await context.cookies()) {
      if (cookie.name.startsWith("search.")) {
        result[cookie.name] = cookie.value;
      }
    }

    return result;
  }

  // A link's URL changes just before its navigation ends and writes, so the jar may lag a
  // moment behind the address.
  async function expectRemembered(expected) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (isDeepStrictEqual(await remembered(), expected)) {
        return;
      }

      await page.waitForTimeout(20);
    }

    assert.deepEqual(await remembered(), expected);
  }

  async function setCookies(cookies) {
    await context.clearCookies();

    const list = [];

    for (const [name, value] of Object.entries(cookies)) {
      list.push({ name, value, url: base });
    }

    await context.addCookies(list);
  }

  async function visit(path, cookies) {
    await setCookies(cookies);
    calls.length = 0;

    const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });

    await page.waitForFunction(() => globalThis.__launchStable !== undefined);
    await page.evaluate(() => globalThis.__launchStable);

    return {
      status: response.status(),
      url: page.url().slice(base.length),
      view: await shownView(),
      notFound: await page.isVisible("#not-found-title"),
      shown: await page.evaluate(() => globalThis.__proofShown),
      calls: [...calls],
      remembered: await remembered(),
    };
  }

  const documents = {};

  // The restored page renders through hydration with the remembered value.
  documents.restore = await visit("/todos", { "proof-user": "alice", [pageSize]: "50" });
  assert.equal(documents.restore.url, "/todos?pageSize=50");
  assert.equal(documents.restore.view, "All · 50 per page · comfortable");
  assert.deepEqual(documents.restore.shown, ["All · 50 per page · comfortable|"]);
  await page.screenshot({ path: join(evidence, `remembered-${build}-restored.png`) });

  // Links keep the retained keys; each commit writes, and clearing the key forgets it.
  await page.click("text=10 per page");
  await page.waitForURL(/pageSize=10/);
  await page.click("nav[aria-label=Filter] >> text=Open");
  await page.waitForURL(/filter=open/);
  assert.equal(page.url().slice(base.length), "/todos?filter=open&pageSize=10");
  await expectRemembered({ [filter]: "open", [pageSize]: "10" });
  await page.click("text=50 per page");
  await page.waitForURL(/pageSize=50/);
  await expectRemembered({ [filter]: "open", [pageSize]: "50" });
  await page.click("nav[aria-label=Filter] >> text=All");
  await page.waitForURL((url) => !url.search.includes("filter"));
  await expectRemembered({ [pageSize]: "50" });
  assert.equal(await page.evaluate(() => globalThis.__launchNavigate("/todos")), true);
  await expectRemembered({});
  checks.push(
    label(
      "Chromium: /todos restores pageSize=50 through hydration with no other value shown; the page's links keep the retained page size, every commit writes document.cookie, and the jar ends at the last value; clearing a key inside the page forgets it",
    ),
  );

  for (const { name, path, cookies, status } of [
    { name: "stale", path: "/todos?origin=kept", cookies: { [filter]: "archived" }, status: 200 },
    {
      name: "two-owners",
      path: "/todos?origin=kept",
      cookies: { [filter]: "archived", [density]: "compact" },
      status: 200,
    },
    {
      name: "missing",
      path: "/todo/42?origin=kept",
      cookies: { [density]: "compact" },
      status: 404,
    },
  ]) {
    const entered = await visit(path, { "proof-user": "alice", unrelated: "keep", ...cookies });

    documents[name] = entered;
    assert.equal(entered.status, status, name);
    assert.equal(entered.url, path, name);
    assert.deepEqual(entered.remembered, {}, name);
    assert.ok((await context.cookies()).some((cookie) => cookie.name === "unrelated"));

    if (status === 200) {
      assert.equal(entered.view, "All · 20 per page · comfortable", name);
      // No not-found and no stale value at any point.
      assert.deepEqual(entered.shown, ["All · 20 per page · comfortable|"], name);
    } else {
      assert.ok(entered.notFound, name);
    }

    await page.screenshot({ path: join(evidence, `remembered-${build}-document-${name}.png`) });
  }

  assert.deepEqual(problems, []);
  checks.push(
    label(
      "Chromium documents: a stale filter, and a stale filter with a remembered density, render the fallbacks at the requested URL through hydration (200, never a not-found or another value), a missing todo stays the 404 page at its URL, each deletes what it restored and keeps other cookies, with no page or hydration errors",
    ),
  );

  // Client navigation from an RPC-free page: the same outcomes, two RPCs, the caller's state.
  async function navigate(path, cookies) {
    await setCookies(cookies);
    calls.length = 0;

    const done = await page.evaluate(
      (url) => globalThis.__launchNavigate(url, { state: { proof: "preserved" } }),
      path,
    );

    await page.waitForLoadState("networkidle");

    return {
      done,
      url: page.url().slice(base.length),
      state: await page.evaluate(() => history.state?.proof),
      view: await shownView(),
      notFound: await page.isVisible("#not-found-title"),
      signIn: await page.isVisible("#sign-in-title"),
      calls: [...calls],
      remembered: await remembered(),
    };
  }

  const clients = {};

  await visit("/static", { "proof-user": "alice" });
  clients.stale = await navigate("/todos?origin=kept", {
    "proof-user": "alice",
    [filter]: "archived",
  });
  assert.equal(clients.stale.url, "/todos?origin=kept");
  assert.equal(clients.stale.state, "preserved");
  assert.equal(clients.stale.view, "All · 20 per page · comfortable");
  assert.deepEqual(clients.stale.remembered, {});

  const filterCalls = [];

  for (const call of clients.stale.calls) {
    if (call.path === "/_rpc/todos/filter") {
      filterCalls.push([JSON.parse(call.body).input.filter, call.status]);
    }
  }

  assert.deepEqual(filterCalls, [
    ["archived", 404],
    ["all", 200],
  ]);
  assert.equal(await page.evaluate(() => globalThis.__launchNavigate("/static")), true);
  clients.staleAgain = await navigate("/todos?origin=kept", { "proof-user": "alice" });
  assert.equal(clients.staleAgain.url, "/todos?origin=kept");
  assert.deepEqual(
    clients.staleAgain.calls.filter((call) => call.path === "/_rpc/todos/filter").length,
    1,
  );

  assert.equal(await page.evaluate(() => globalThis.__launchNavigate("/static")), true);
  clients.missing = await navigate("/todo/42?origin=kept", {
    "proof-user": "alice",
    [density]: "compact",
  });
  assert.equal(clients.missing.url, "/todo/42?origin=kept");
  // The not-found page's own redirect carries no state; only the retry keeps the caller's.
  assert.ok(clients.missing.notFound);
  assert.deepEqual(clients.missing.remembered, {});
  assert.deepEqual(
    clients.missing.calls
      .filter((call) => call.path === "/_rpc/todo/get")
      .map((call) => call.status),
    [404, 404],
  );

  assert.equal(await page.evaluate(() => globalThis.__launchNavigate("/static")), true);

  for (const time of [1, 2]) {
    const redirected = await navigate("/todos", { [pageSize]: "50" });

    clients[`redirect-${time}`] = redirected;
    assert.equal(redirected.url, "/sign-in", `entry ${time}`);
    assert.ok(redirected.signIn);
    assert.deepEqual(redirected.remembered, { [pageSize]: "50" });
    assert.equal(await page.evaluate(() => globalThis.__launchNavigate("/static")), true);
  }

  assert.deepEqual(problems, []);
  await writeFile(
    join(evidence, `remembered-${build}-browser.json`),
    JSON.stringify({ documents, clients }, null, 2),
  );
  await context.close();
  checks.push(
    label(
      "Chromium client navigation: a stale filter calls todos.filter with archived (404) then all (200) and shows the fallback at the original URL with the caller's state, deleting the cookie; the next entry restores nothing; a missing todo retries once (two 404 RPCs) and shows not-found; a signed-out entry follows the redirect and keeps the remembered page size",
    ),
  );
}

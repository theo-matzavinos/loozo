import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DOCUMENT,
  PLATFORM_ID,
  REQUEST,
  RESPONSE_INIT,
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { searchCookies } from "../dist/index.js";

const kept = "Path=/; Max-Age=31536000; Secure; SameSite=Lax";
const expired = "Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax";

// The storage searchCookies(options) gives one server render of a request with `cookie`.
function serverStorage({ cookie, response = { headers: new Headers() }, options } = {}) {
  const providers = [{ provide: PLATFORM_ID, useValue: "server" }];

  if (cookie !== undefined) {
    providers.push({
      provide: REQUEST,
      useValue: new Request("http://test/todos", { headers: { cookie } }),
    });
  }

  if (response !== null) {
    providers.push({ provide: RESPONSE_INIT, useValue: response });
  }

  const injector = createEnvironmentInjector(providers, createEnvironmentInjector([]));

  return { storage: runInInjectionContext(injector, searchCookies(options)), response };
}

// A document whose cookie property behaves like a browser's jar for name=value pairs.
function cookieDocument(initial) {
  const jar = new Map(initial);
  const written = [];

  return {
    written,
    jar,
    document: {
      get cookie() {
        const pairs = [];

        for (const [name, value] of jar) {
          pairs.push(`${name}=${value}`);
        }

        return pairs.join("; ");
      },
      set cookie(text) {
        written.push(text);

        const [pair] = text.split(";");
        const separator = pair.indexOf("=");
        const name = pair.slice(0, separator);

        if (text.includes("Max-Age=0")) {
          jar.delete(name);
        } else {
          jar.set(name, pair.slice(separator + 1));
        }
      },
    },
  };
}

function browserStorage(browser, options) {
  const injector = createEnvironmentInjector(
    [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: DOCUMENT, useValue: browser.document },
    ],
    createEnvironmentInjector([]),
  );

  return runInInjectionContext(injector, searchCookies(options));
}

function setCookies(response) {
  return response.headers.getSetCookie();
}

test("on the server it reads the request's cookie under the prefixed name", () => {
  const { storage, response } = serverStorage({
    cookie: "proof-user=alice; search.todos.filter=urgent&home; search.todos.pageSize=50",
  });

  assert.equal(storage.read("todos.pageSize"), "50");
  assert.equal(storage.read("todos.filter"), "urgent&home");
  assert.equal(storage.read("todos.sort"), undefined);
  assert.deepEqual(setCookies(response), []);
});

test("writes skip unchanged values and append each change in order", () => {
  const { storage, response } = serverStorage({ cookie: "search.todos.pageSize=50" });

  storage.write("todos.pageSize", "50");
  assert.deepEqual(setCookies(response), []);

  storage.write("todos.pageSize", "100");
  storage.write("todos.pageSize", "50");
  storage.write("todos.pageSize", "50");

  assert.deepEqual(setCookies(response), [
    `search.todos.pageSize=100; ${kept}`,
    `search.todos.pageSize=50; ${kept}`,
  ]);
  assert.equal(storage.read("todos.pageSize"), "50");
});

test("a forget appends one deletion, and reads see it", () => {
  const { storage, response } = serverStorage({ cookie: "search.todos.pageSize=50" });

  storage.forget("todos.pageSize");
  storage.forget("todos.pageSize");
  storage.forget("todos.sort");

  assert.deepEqual(setCookies(response), [`search.todos.pageSize=; ${expired}`]);
  assert.equal(storage.read("todos.pageSize"), undefined);

  storage.write("todos.pageSize", "20");
  assert.equal(storage.read("todos.pageSize"), "20");
});

test("appends beside the cookies already on the response, keeping its Headers", () => {
  const headers = new Headers();

  headers.append("set-cookie", "proof-seen=1; Path=/; HttpOnly; Secure; SameSite=Lax");

  const { storage, response } = serverStorage({ cookie: "", response: { headers } });

  storage.write("todos.pageSize", "50");

  assert.equal(response.headers, headers);
  assert.deepEqual(setCookies(response), [
    "proof-seen=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    `search.todos.pageSize=50; ${kept}`,
  ]);

  // Angular may hand other HeadersInit; it becomes Headers with what it held.
  const plain = serverStorage({ cookie: "", response: { headers: { "x-proof": "1" } } });

  plain.storage.write("todos.pageSize", "50");
  assert.ok(plain.response.headers instanceof Headers);
  assert.equal(plain.response.headers.get("x-proof"), "1");
  assert.deepEqual(setCookies(plain.response), [`search.todos.pageSize=50; ${kept}`]);
});

test("a cookie over 4,096 bytes isn't written, and the old value is forgotten with a warning", (t) => {
  const warn = t.mock.method(console, "warn", () => undefined);
  const { storage, response } = serverStorage({ cookie: "search.todos.filter=a" });
  // 4,096 bytes with the name and attributes, the largest that's written.
  const fits = "b".repeat(4096 - `search.todos.filter=; ${kept}`.length);

  storage.write("todos.filter", fits);
  storage.write("todos.filter", `${fits}c`);

  assert.deepEqual(setCookies(response), [
    `search.todos.filter=${fits}; ${kept}`,
    `search.todos.filter=; ${expired}`,
  ]);
  assert.equal(storage.read("todos.filter"), undefined);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /todos\.filter.*4096 bytes/);

  // Nothing stored: nothing to forget.
  storage.write("todos.filter", `${fits}c`);
  assert.equal(setCookies(response).length, 2);
});

test("an oversized value already stored is forgotten on an equal write, not kept", (t) => {
  t.mock.method(console, "warn", () => undefined);

  // Stored earlier with a shorter lifetime, so its cookie fit then; with the default it doesn't.
  const text = "b".repeat(4096 - `search.todos.filter=; ${kept}`.length + 1);
  const { storage, response } = serverStorage({ cookie: `search.todos.filter=${text}` });

  storage.write("todos.filter", text);

  assert.deepEqual(setCookies(response), [`search.todos.filter=; ${expired}`]);
  assert.equal(storage.read("todos.filter"), undefined);
});

test("a render that uses the storage varies on Cookie, once; one that doesn't, doesn't", () => {
  const used = serverStorage({
    cookie: "search.todos.pageSize=50",
    response: { headers: new Headers({ vary: "Accept-Encoding" }) },
  });

  used.storage.read("todos.pageSize");
  used.storage.write("todos.pageSize", "100");
  used.storage.forget("todos.sort");
  assert.equal(used.response.headers.get("vary"), "Accept-Encoding, Cookie");

  const unused = serverStorage({ cookie: "search.todos.pageSize=50" });

  assert.equal(unused.response.headers.get("vary"), null);
});

test("without a request it reads nothing, and without RESPONSE_INIT it sends nothing", () => {
  const prerender = serverStorage();

  assert.equal(prerender.storage.read("todos.pageSize"), undefined);

  const unanswered = serverStorage({ cookie: "search.todos.pageSize=50", response: null });

  unanswered.storage.write("todos.pageSize", "100");
  unanswered.storage.forget("todos.sort");
  assert.equal(unanswered.storage.read("todos.pageSize"), "100");
});

test("options set the prefix, lifetime and Secure attribute", () => {
  const { storage, response } = serverStorage({
    cookie: "app.todos.pageSize=50",
    options: { prefix: "app.", maxAge: 60, secure: false },
  });

  assert.equal(storage.read("todos.pageSize"), "50");
  storage.write("todos.pageSize", "100");
  storage.forget("todos.pageSize");

  assert.deepEqual(setCookies(response), [
    "app.todos.pageSize=100; Path=/; Max-Age=60; SameSite=Lax",
    "app.todos.pageSize=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
  ]);
  assert.throws(() => searchCookies({ prefix: "search;" }), TypeError);
  assert.throws(() => searchCookies({ maxAge: 0 }), TypeError);
  assert.throws(() => searchCookies({ maxAge: 1.5 }), TypeError);
});

test("in the browser it reads and writes document.cookie, skipping unchanged values", () => {
  const browser = cookieDocument([
    ["proof-user", "alice"],
    ["search.todos.pageSize", "50"],
  ]);
  const storage = browserStorage(browser);

  assert.equal(storage.read("todos.pageSize"), "50");

  storage.write("todos.pageSize", "50");
  storage.forget("todos.sort");
  assert.deepEqual(browser.written, []);

  storage.write("todos.pageSize", "100");
  storage.forget("todos.pageSize");
  storage.forget("todos.pageSize");

  assert.deepEqual(browser.written, [
    `search.todos.pageSize=100; ${kept}`,
    `search.todos.pageSize=; ${expired}`,
  ]);
  assert.deepEqual([...browser.jar], [["proof-user", "alice"]]);
});

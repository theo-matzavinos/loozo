import assert from "node:assert/strict";
import { test } from "node:test";
import * as root from "@loozo/angular-router";

const { defineRoute, createUrl, stringParam, numberParam, booleanParam, enumParam, withFallback } =
  root;

test("plain Node public namespace and concrete product consumer", () => {
  assert.deepEqual(Object.keys(root).sort(), [
    "booleanParam",
    "createUrl",
    "defineRoute",
    "enumParam",
    "numberParam",
    "stringParam",
    "withFallback",
  ]);
  // The optional and nullable search wrappers are gone: every search key is optional.
  assert.equal("optionalSearchParam" in root, false);
  assert.equal("nullableSearchParam" in root, false);

  const product = defineRoute("products/$productId", {
    params: { productId: numberParam },
    search: { tab: enumParam(["details", "reviews"]) },
    fragments: ["summary", "reviews"],
  });

  assert.equal(
    createUrl(product, {
      params: { productId: 42 },
      search: { tab: "reviews" },
      fragment: "summary",
    }),
    "/products/42?tab=reviews#summary",
  );
  assert.equal(createUrl(product, { params: { productId: 42 } }), "/products/42");
  assert.equal(Object.isFrozen(product), true);
  assert.deepEqual(Object.keys(defineRoute("plain", {})), ["path"]);
});

test("transitive pathless ownership, namespaces and global lexical query order", () => {
  const team = defineRoute("teams/$teamId", {
    params: { teamId: numberParam },
    search: { teamId: stringParam, z: stringParam },
    fragments: ["parent"],
  });
  const layout = defineRoute("", { parent: team });
  const child = defineRoute("$id/middle/$id", {
    parent: layout,
    params: { id: stringParam },
    search: { a: withFallback(booleanParam, false) },
    fragments: ["child"],
  });

  assert.equal(
    createUrl(child, {
      params: { teamId: 7, id: "λ/(1)" },
      search: { teamId: "query", z: "", a: true },
      fragment: "child",
    }),
    "/teams/7/%CE%BB%2F%281%29/middle/%CE%BB%2F%281%29?a=true&teamId=query&z=#child",
  );
  assert.throws(
    () => defineRoute("$teamId", { parent: layout, params: { teamId: numberParam } }),
    TypeError,
  );
  assert.throws(
    () => defineRoute("again", { parent: layout, search: { z: stringParam } }),
    TypeError,
  );
  assert.throws(
    () =>
      createUrl(child, {
        params: { teamId: 7, id: "x" },
        search: { teamId: "q", a: false },
        fragment: "parent",
      }),
    TypeError,
  );
});

test("own records and genuine route membership reject copies and inherited impostors", () => {
  const actual = defineRoute("parent", {});

  for (const fake of [undefined, null, { path: "parent" }, { ...actual }, Object.create(actual)]) {
    assert.throws(() => defineRoute("child", { parent: fake }), TypeError);
    assert.throws(() => createUrl(fake, {}), TypeError);
  }

  for (const config of [
    undefined,
    null,
    [],
    Object.create({ search: { q: stringParam } }),
    { surprise: true },
  ]) {
    assert.throws(() => defineRoute("plain", config), TypeError);
  }

  assert.throws(
    () => defineRoute("$id", { params: Object.create({ id: stringParam }) }),
    TypeError,
  );
  assert.throws(
    () => defineRoute("plain", { resolve: Object.create({ value: () => 1 }) }),
    TypeError,
  );
  assert.throws(() => createUrl(actual, Object.create({ fragment: "x" })), TypeError);

  const nullMap = Object.assign(Object.create(null), {
    constructor: stringParam,
    toString: stringParam,
  });
  const broad = defineRoute("$constructor/$toString", { params: nullMap });

  assert.equal(
    createUrl(broad, {
      params: Object.assign(Object.create(null), { constructor: "a", toString: "b" }),
    }),
    "/a/b",
  );
});

test("snapshot containers preserve mutable codecs, callbacks and opaque logical values", () => {
  let callbacks = 0;
  const codec = {
    parse: () => {
      callbacks += 1;

      return "parsed";
    },
    stringify: (value) => `original-${value.label}`,
  };
  const params = { id: codec };
  const search = { q: codec };
  const resolver = () => {
    callbacks += 1;

    return "resolved";
  };
  const resolve = { value: resolver };
  const predicate = () => {
    callbacks += 1;

    return true;
  };
  const guard = () => {
    callbacks += 1;

    return true;
  };
  const provider = { provide: "token", useFactory: resolver };
  const opaque = { label: "x", nested: { count: 1 } };
  const fragments = ["first"];
  const route = defineRoute("$id", {
    params,
    search,
    resolve,
    runGuardsAndResolvers: predicate,
    canActivate: [guard],
    providers: [provider],
    title: resolver,
    data: { opaque },
    fragments,
  });

  params.id = stringParam;
  search.q = stringParam;
  resolve.value = () => "replaced";
  fragments[0] = "later";
  assert.equal(route.resolve.value, resolver);
  assert.equal(route.runGuardsAndResolvers, predicate);
  assert.equal(Object.isFrozen(route.resolve), true);
  assert.equal(
    createUrl(route, { params: { id: opaque }, search: { q: opaque }, fragment: "first" }),
    "/original-x?q=original-x#first",
  );
  codec.stringify = (value) => `changed-${value.label}`;
  assert.equal(
    createUrl(route, { params: { id: opaque }, search: { q: opaque } }),
    "/changed-x?q=changed-x",
  );

  for (const value of [
    codec,
    opaque,
    opaque.nested,
    provider,
    params,
    search,
    resolve,
    fragments,
  ]) {
    assert.equal(Object.isFrozen(value), false);
  }

  assert.equal(callbacks, 0);
});

test("native symbol resolver/data keys retain callback and opaque identities", () => {
  const key = Symbol("native key");
  const opaque = { mutable: true };
  const callback = () => opaque;
  const resolve = { [key]: callback };
  const route = defineRoute("symbol", { data: { [key]: opaque }, resolve });

  assert.equal(route.resolve[key], callback);
  assert.equal(Object.isFrozen(route.resolve), true);
  assert.equal(Object.isFrozen(resolve), false);
  assert.equal(Object.isFrozen(opaque), false);
  assert.equal(createUrl(route, {}), "/symbol");
});

test("withFallback delegates present values and validates its arguments", () => {
  const value = { label: "opaque" };
  const failure = new Error("identity");
  const codec = {
    parse: (raw) => {
      if (raw === "throw") {
        throw failure;
      }

      return value;
    },
    stringify: (input) => input.label,
  };
  const fallback = { label: "fallback" };
  const wrapper = withFallback(codec, fallback);

  assert.equal(wrapper.parse("ordinary"), value);
  assert.equal(wrapper.stringify(value), "opaque");
  assert.throws(
    () => wrapper.parse("throw"),
    (error) => error === failure,
  );
  assert.equal(Object.isFrozen(fallback), false);

  // A fallback may itself be undefined or null.
  withFallback(numberParam, undefined);
  withFallback(numberParam, null);

  for (const malformed of [undefined, null, 1, {}, { parse: String }, { stringify: String }]) {
    assert.throws(() => withFallback(malformed, 1), TypeError);
  }

  assert.throws(() => withFallback(wrapper, fallback), /already has a fallback/);

  // Search-only: a path or catchall param can't read a fallback.
  assert.throws(
    () => defineRoute("$id", { params: { id: wrapper } }),
    /withFallback codecs are search-only/,
  );
  assert.throws(
    () => defineRoute("docs/$parts[]", { params: { parts: withFallback(stringParam, "") } }),
    /withFallback codecs are search-only/,
  );
});

test("catchall arrays, repeated scalar callbacks and cardinality prevalidation", () => {
  let calls = 0;
  const changing = {
    parse: String,
    stringify: (value) => {
      calls += 1;

      return `${value}-${calls}`;
    },
  };
  const repeated = defineRoute("$id/$id", { params: { id: changing } });

  assert.equal(createUrl(repeated, { params: { id: "x" } }), "/x-1/x-2");

  const docs = defineRoute("$id/fixed/$parts[]", { params: { id: changing, parts: stringParam } });

  assert.throws(() => createUrl(docs, { params: { id: "x", parts: "not-array" } }), TypeError);
  assert.equal(calls, 2);
  assert.equal(
    createUrl(docs, { params: { id: "x", parts: ["a/b", "%2F", "λ(1)"] } }),
    "/x-3/fixed/a%2Fb/%252F/%CE%BB%281%29",
  );
  assert.equal(createUrl(docs, { params: { id: "x", parts: [] } }), "/x-4/fixed");
  assert.throws(() => defineRoute("", { parent: docs }), TypeError);

  const root = defineRoute("$parts[]", { params: { parts: stringParam } });

  assert.equal(createUrl(root, { params: { parts: [] } }), "/");
});

test("URL runtime boundary validates unknown keys, records, encoding and output types", () => {
  const route = defineRoute("a(b)/%2e/$id", {
    params: { id: stringParam },
    search: { q: stringParam, opt: stringParam },
    fragments: ["\uD800"],
  });
  const valid = { params: { id: "a/b" }, search: { q: "", opt: undefined } };

  assert.equal(createUrl(route, valid), "/a%28b%29/%252e/a%2Fb?q=");

  for (const options of [
    undefined,
    null,
    [],
    {},
    { ...valid, extra: true },
    { ...valid, params: { id: "x", extra: "y" } },
    { ...valid, search: { q: "x", extra: "y" } },
    { ...valid, search: null },
    { ...valid, fragment: undefined },
  ]) {
    assert.throws(() => createUrl(route, options), TypeError);
  }

  for (const id of ["", ".", ".."]) {
    assert.throws(() => createUrl(route, { ...valid, params: { id } }), TypeError);
  }

  assert.throws(() => createUrl(route, { ...valid, params: { id: "\uD800" } }), URIError);
  assert.throws(() => createUrl(route, { ...valid, search: { q: "\uDC00" } }), URIError);
  assert.throws(() => createUrl(route, { ...valid, fragment: "\uD800" }), URIError);

  const nonString = { parse: String, stringify: () => 42 };

  assert.throws(
    () => createUrl(defineRoute("$id", { params: { id: nonString } }), { params: { id: "x" } }),
    TypeError,
  );
  assert.throws(() => createUrl(defineRoute("plain", {}), { search: {} }), TypeError);
  assert.throws(() => createUrl(defineRoute("plain", {}), { params: {} }), TypeError);
});

test("grammar rejects reserved markers, nonterminal catchalls and static invalid Unicode", () => {
  for (const path of ["/", "/a", "a/", "a//b", ".", "..", "*", "**", ":id", "\uD800"]) {
    assert.throws(() => defineRoute(path, {}), TypeError);
  }

  for (const path of [
    "$[]",
    "$id?",
    "$id*",
    "$...id",
    "$__proto__",
    "$rest[][]",
    "$rest[]suffix",
    "$rest[]/tail",
    "$rest/$rest[]",
  ]) {
    assert.throws(() => defineRoute(path, { params: { rest: stringParam } }), TypeError);
  }

  assert.equal(
    createUrl(defineRoute("a?b/a#b/a;b/a%b/a\\b/x:y/%2F/...", {}), {}),
    "/a%3Fb/a%23b/a%3Bb/a%25b/a%5Cb/x%3Ay/%252F/...",
  );
});

test("redirect declaration validates shape and remains inert for source URL creation", () => {
  let calls = 0;
  const codec = {
    parse: () => {
      calls += 1;

      return ["a"];
    },
    stringify: (value) => value.join(","),
  };
  const target = defineRoute("new/$parts[]", {
    params: { parts: stringParam },
    search: { q: stringParam },
    fragments: ["summary"],
  });
  const redirect = {
    to: target,
    params: { parts: "packed" },
    search: { mode: "replace", values: { q: "replacement" } },
    fragment: { mode: "replace", value: "summary" },
  };
  const source = defineRoute("old/$packed", { params: { packed: codec }, redirect });

  assert.equal(createUrl(source, { params: { packed: ["a", "b"] } }), "/old/a%2Cb");
  assert.equal(calls, 0);

  for (const malformed of [
    { ...redirect, params: {} },
    { ...redirect, to: { ...target } },
    { ...redirect, search: { mode: "drop", values: {} } },
    { ...redirect, search: { mode: "keep" } },
    { ...redirect, search: { mode: "replace", values: { q: "x", extra: "y" } } },
    { ...redirect, fragment: { mode: "replace", value: "unknown" } },
    { ...redirect, extra: true },
  ]) {
    assert.throws(
      () => defineRoute("$packed", { params: { packed: codec }, redirect: malformed }),
      TypeError,
    );
  }

  for (const guard of [undefined, null, false, 42]) {
    assert.throws(() => defineRoute("bad", { canDeactivate: [guard] }), TypeError);
  }

  for (const key of ["canActivate", "canMatch"]) {
    assert.throws(
      () => defineRoute("$packed", { params: { packed: codec }, redirect, [key]: [] }),
      TypeError,
    );
  }
});

test("onInvalidParams is a callback on routes with local path params only", () => {
  const handler = () => false;
  const parent = defineRoute("teams/$teamId", { params: { teamId: numberParam } });
  const target = defineRoute("items", {});

  defineRoute("items/$id", { params: { id: numberParam }, onInvalidParams: handler });
  defineRoute("docs/$parts[]", { params: { parts: stringParam }, onInvalidParams: handler });

  for (const value of [undefined, null, false, "redirect", {}]) {
    assert.throws(
      () => defineRoute("items/$id", { params: { id: numberParam }, onInvalidParams: value }),
      TypeError,
    );
  }

  // Inherited params belong to the parent's own matching guard.
  for (const config of [{}, { parent }]) {
    assert.throws(
      () => defineRoute("items", { ...config, onInvalidParams: handler }),
      /onInvalidParams requires local path params/,
    );
  }

  assert.throws(
    () =>
      defineRoute("old/$id", {
        params: { id: numberParam },
        onInvalidParams: handler,
        redirect: { to: target, search: { mode: "drop" }, fragment: { mode: "drop" } },
      }),
    /Redirect cannot declare own canActivate, canMatch or onInvalidParams/,
  );
});

test("every search key may be omitted when writing a URL or redirect", () => {
  const page = withFallback(numberParam, 1);
  const list = defineRoute("items", { search: { page, sort: stringParam, q: stringParam } });

  assert.equal(createUrl(list, {}), "/items");
  assert.equal(createUrl(list, { search: {} }), "/items");
  assert.equal(createUrl(list, { search: { q: "x" } }), "/items?q=x");
  assert.equal(createUrl(list, { search: { q: "x", page: undefined } }), "/items?q=x");
  assert.equal(createUrl(list, { search: { q: "x", page: 2 } }), "/items?page=2&q=x");
  assert.throws(() => createUrl(list, { search: { other: 1 } }), /Unknown search values key/);

  // No target key is required, so drop, preserve and an empty replacement are all valid.
  for (const search of [
    { mode: "drop" },
    { mode: "preserve" },
    { mode: "replace", values: {} },
    { mode: "replace", values: { page: undefined, q: "x" } },
  ]) {
    defineRoute("old", { redirect: { to: list, search, fragment: { mode: "drop" } } });
  }
});

test("absent prototype-named optional search never reads inherited input", () => {
  for (const key of [
    "constructor",
    "toString",
    "__proto__",
    "toLocaleString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
  ]) {
    const route = defineRoute("optional", { search: { [key]: stringParam } });

    assert.equal(createUrl(route, {}), "/optional");
    assert.equal(createUrl(route, { search: {} }), "/optional");
    assert.equal(createUrl(route, { search: { [key]: undefined } }), "/optional");
    assert.equal(createUrl(route, { search: { [key]: "owned" } }), `/optional?${key}=owned`);

    const calls = [];
    const codec = {
      parse: () => {
        throw new Error("URL creation must not parse");
      },
      stringify: (value) => {
        calls.push(value);

        return value.text;
      },
    };
    const optionalObject = defineRoute("object", { search: { [key]: codec } });

    assert.equal(createUrl(optionalObject, {}), "/object");
    assert.equal(createUrl(optionalObject, { search: {} }), "/object");
    assert.equal(createUrl(optionalObject, { search: { [key]: undefined } }), "/object");
    assert.equal(calls.length, 0);

    const alias = defineRoute("optional-alias", {
      redirect: {
        to: optionalObject,
        search: { mode: "replace", values: {} },
        fragment: { mode: "drop" },
      },
    });

    assert.equal(createUrl(alias, {}), "/optional-alias");
    assert.equal(calls.length, 0);

    const mixed = defineRoute("mixed", {
      search: { required: numberParam, [key]: codec },
    });

    assert.equal(createUrl(mixed, { search: { required: 7 } }), "/mixed?required=7");
    assert.equal(
      createUrl(mixed, { search: { required: 7, [key]: undefined } }),
      "/mixed?required=7",
    );
    assert.equal(calls.length, 0);

    const opaque = { text: "a/b", nested: { mutable: true } };
    const expectedKeys = [key, "required"].sort();
    const expectedQuery = [];

    for (const queryKey of expectedKeys) {
      if (queryKey === key) {
        expectedQuery.push(`${key}=a%2Fb`);
      } else {
        expectedQuery.push("required=7");
      }
    }

    assert.equal(
      createUrl(mixed, { search: { required: 7, [key]: opaque } }),
      `/mixed?${expectedQuery.join("&")}`,
    );
    assert.deepEqual(calls, [opaque]);
    assert.equal(Object.isFrozen(opaque.nested), false);
    assert.equal(createUrl(mixed, { search: {} }), "/mixed");
    assert.equal(calls.length, 1);
  }
});

test("an undefined search value omits the key; codec values stay opaque", () => {
  let parses = 0;
  let stringifies = 0;
  const sentinel = {
    parse: () => {
      parses += 1;

      return undefined;
    },
    stringify: (value) => {
      assert.equal(value, undefined);
      stringifies += 1;

      return "sentinel";
    },
  };
  const opaque = { nested: { value: undefined, mutable: true } };
  const box = {
    parse: () => {
      parses += 1;

      return opaque;
    },
    stringify: (value) => {
      assert.equal(value, opaque);
      assert.equal(value.nested.value, undefined);
      stringifies += 1;

      return "boxed";
    },
  };
  const target = defineRoute("target", { search: { q: sentinel, box } });
  const alias = defineRoute("alias", {
    redirect: {
      to: target,
      search: { mode: "replace", values: { q: undefined, box: opaque } },
      fragment: { mode: "drop" },
    },
  });

  assert.equal(createUrl(alias, {}), "/alias");
  assert.equal(parses, 0);
  assert.equal(stringifies, 0);
  assert.equal(Object.isFrozen(opaque), false);
  assert.equal(Object.isFrozen(opaque.nested), false);
  assert.equal(createUrl(target, { search: { q: undefined, box: opaque } }), "/target?box=boxed");
  assert.equal(createUrl(target, { search: { box: opaque } }), "/target?box=boxed");
  assert.equal(stringifies, 2);
  assert.equal(parses, 0);
  // A path value is never omitted, so an undefined-valued path codec still stringifies.
  assert.equal(
    createUrl(defineRoute("$id", { params: { id: sentinel } }), { params: { id: undefined } }),
    "/sentinel",
  );
  assert.equal(stringifies, 3);
});

test("built-in number, boolean and enum logical boundaries", () => {
  for (const [raw, value] of [
    [" 42 ", 42],
    ["1e3", 1000],
    ["0x10", 16],
  ]) {
    assert.equal(numberParam.parse(raw), value);
  }

  for (const raw of ["", " ", "NaN", "Infinity", "4cats"]) {
    assert.throws(() => numberParam.parse(raw), Error);
  }

  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => numberParam.stringify(value), Error);
  }

  assert.equal(numberParam.stringify(-0), "0");
  assert.equal(booleanParam.parse("true"), true);
  assert.equal(booleanParam.parse("false"), false);

  for (const raw of ["TRUE", "1", " true "]) {
    assert.throws(() => booleanParam.parse(raw), Error);
  }

  const choice = enumParam(["", "Open"]);

  assert.equal(choice.parse(""), "");
  assert.throws(() => choice.parse("open"), Error);
  assert.throws(() => choice.stringify("other"), Error);
});

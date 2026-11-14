import assert from "node:assert/strict";
import { test } from "node:test";
import * as root from "@loozo/angular-router";
import { resolve } from "node:path";
import ts from "typescript";
import { createRouteFactory, routeContributions, routeMetadata } from "@loozo/angular-router/_core";
import { emitPackage, installExtension } from "./extension/emit.mjs";

const {
  defineRoute,
  createUrl,
  stringParam,
  numberParam,
  booleanParam,
  enumParam,
  withFallback,
  arrayParam,
} = root;

test("plain Node public namespace and concrete product consumer", () => {
  assert.deepEqual(Object.keys(root).sort(), [
    "arrayParam",
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
    () => defineRoute("plain", {}).resolve(Object.create({ value: () => 1 })),
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
  const route = defineRoute("$id", { params, search, fragments })
    .resolve(resolve)
    .runGuardsAndResolvers(predicate)
    .canActivate([guard])
    .providers([provider])
    .title(resolver)
    .data({ opaque });

  params.id = stringParam;
  search.q = stringParam;
  resolve.value = () => "replaced";
  fragments[0] = "later";
  const { config } = routeMetadata(route);

  assert.equal(config.resolve.value, resolver);
  assert.equal(config.runGuardsAndResolvers, predicate);
  assert.equal(Object.isFrozen(config.resolve), true);
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
  const route = defineRoute("symbol", {})
    .data({ [key]: opaque })
    .resolve(resolve);

  const { config } = routeMetadata(route);

  assert.equal(config.resolve[key], callback);
  assert.equal(config.data[key], opaque);
  assert.equal(Object.isFrozen(config.resolve), true);
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

test("arrayParam delegates each value, validates its arguments and is search-only", () => {
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
  const wrapper = arrayParam(codec);

  assert.equal(wrapper.parse("ordinary"), value);
  assert.equal(wrapper.stringify(value), "opaque");
  assert.throws(
    () => wrapper.parse("throw"),
    (error) => error === failure,
  );

  for (const malformed of [undefined, null, 1, {}, { parse: String }, { stringify: String }]) {
    assert.throws(() => arrayParam(malformed), TypeError);
  }

  // No fallback in either direction, and no list of lists.
  assert.throws(() => arrayParam(withFallback(numberParam, 1)), /has a fallback/);
  assert.throws(() => withFallback(wrapper, []), /cannot wrap an arrayParam codec/);
  assert.throws(() => arrayParam(wrapper), /another arrayParam codec/);

  // A path uses a terminal catchall instead.
  assert.throws(
    () => defineRoute("$id", { params: { id: wrapper } }),
    /arrayParam codecs are search-only/,
  );
  assert.throws(
    () => defineRoute("docs/$parts[]", { params: { parts: arrayParam(stringParam) } }),
    /arrayParam codecs are search-only/,
  );
});

test("arrayParam keys write one pair per element and nothing for an empty list", () => {
  let calls = 0;
  const counted = {
    parse: (raw) => raw,
    stringify: (input) => {
      calls += 1;

      return input;
    },
  };
  const list = defineRoute("articles", {
    search: { tag: arrayParam(stringParam), q: stringParam, n: arrayParam(numberParam) },
  });

  assert.equal(
    createUrl(list, { search: { tag: ["c", "a", "a"], q: "s", n: [2, 1] } }),
    "/articles?n=2&n=1&q=s&tag=c&tag=a&tag=a",
  );
  assert.equal(createUrl(list, { search: { tag: [] } }), "/articles");
  assert.equal(createUrl(list, { search: { tag: undefined, q: "s" } }), "/articles?q=s");
  assert.equal(createUrl(list, { search: { tag: [""] } }), "/articles?tag=");
  assert.equal(
    createUrl(list, { search: { tag: ["a b", "x&y=z", "(p)"] } }),
    "/articles?tag=a%20b&tag=x%26y%3Dz&tag=%28p%29",
  );
  assert.throws(() => createUrl(list, { search: { n: [Number.NaN] } }), /finite number/);

  // Cardinality is checked before any stringifier runs.
  const checked = defineRoute("checked", { search: { a: counted, b: arrayParam(counted) } });

  for (const malformed of ["x", { 0: "x", length: 1 }, null]) {
    assert.throws(
      () => createUrl(checked, { search: { a: "first", b: malformed } }),
      /Search array requires an array: b/,
    );
  }

  assert.equal(calls, 0);

  // An omitted prototype-named key reads nothing inherited.
  const named = defineRoute("named", { search: { toString: arrayParam(stringParam) } });

  assert.equal(createUrl(named, {}), "/named");
  assert.equal(createUrl(named, { search: { toString: ["x"] } }), "/named?toString=x");

  // Redirect replacements are checked for shape at declaration, without running codecs.
  for (const values of [{ tag: ["a"] }, { tag: [] }, { tag: undefined }, {}]) {
    defineRoute("old", {}).redirect({
      to: list,
      search: { mode: "replace", values },
      fragment: { mode: "drop" },
    });
  }

  assert.throws(
    () =>
      defineRoute("old", {}).redirect({
        to: list,
        search: { mode: "replace", values: { tag: "a" } },
        fragment: { mode: "drop" },
      }),
    /Redirect search array requires an array: tag/,
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
  const source = defineRoute("old/$packed", { params: { packed: codec } }).redirect(redirect);

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
      () => defineRoute("$packed", { params: { packed: codec } }).redirect(malformed),
      TypeError,
    );
  }

  for (const guard of [undefined, null, false, 42]) {
    assert.throws(() => defineRoute("bad", {}).canDeactivate([guard]), TypeError);
  }

  // Every guard step rules a redirect out, so the step is gone.
  for (const key of ["canActivate", "canMatch", "canActivateChild", "canDeactivate"]) {
    const guarded = defineRoute("$packed", { params: { packed: codec } })[key]([]);

    assert.equal("redirect" in guarded, false);
  }
});

test("onInvalidParams is a callback on routes with local path params only", () => {
  const handler = () => false;
  const parent = defineRoute("teams/$teamId", { params: { teamId: numberParam } });
  const target = defineRoute("items", {});

  defineRoute("items/$id", { params: { id: numberParam } }).onInvalidParams(handler);
  defineRoute("docs/$parts[]", { params: { parts: stringParam } }).onInvalidParams(handler);

  for (const value of [undefined, null, false, "redirect", {}]) {
    assert.throws(
      () => defineRoute("items/$id", { params: { id: numberParam } }).onInvalidParams(value),
      TypeError,
    );
  }

  // Inherited params belong to the parent's own matching guard: the step isn't offered.
  for (const facts of [{}, { parent }]) {
    assert.equal("onInvalidParams" in defineRoute("items", facts), false);
  }

  // A handler rules a redirect out.
  const handled = defineRoute("old/$id", { params: { id: numberParam } }).onInvalidParams(handler);

  assert.equal("redirect" in handled, false);
  assert.equal(typeof target.path, "string");
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
    defineRoute("old", {}).redirect({ to: list, search, fragment: { mode: "drop" } });
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

    const alias = defineRoute("optional-alias", {}).redirect({
      to: optionalObject,
      search: { mode: "replace", values: {} },
      fragment: { mode: "drop" },
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
  const alias = defineRoute("alias", {}).redirect({
    to: target,
    search: { mode: "replace", values: { q: undefined, box: opaque } },
    fragment: { mode: "drop" },
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

test("each step returns a new frozen stage and leaves the earlier one unchanged", () => {
  const base = defineRoute("items/$id", { params: { id: numberParam } });
  const titled = base.title("Item");
  const guarded = base.canActivate([() => true]);

  assert.notEqual(titled, base);
  assert.notEqual(guarded, titled);

  for (const stage of [base, titled, guarded]) {
    assert.equal(Object.isFrozen(stage), true);
    assert.deepEqual(Object.keys(stage), ["path"]);
  }

  assert.equal(routeMetadata(base).config.title, undefined);
  assert.equal(routeMetadata(base).config.canActivate, undefined);
  assert.equal(routeMetadata(titled).config.title, "Item");
  assert.equal(routeMetadata(titled).config.canActivate, undefined);
  assert.equal(routeMetadata(guarded).config.title, undefined);

  // A used step is gone; the others remain offered.
  assert.equal("title" in titled, false);
  assert.equal(typeof titled.canActivate, "function");
  assert.equal("canActivate" in guarded, false);
  assert.equal("redirect" in guarded, false);
  assert.equal(typeof titled.redirect, "function");

  const target = defineRoute("new", {});
  const ended = titled.redirect({
    to: target,
    search: { mode: "drop" },
    fragment: { mode: "drop" },
  });

  assert.deepEqual(Object.getOwnPropertyNames(ended), ["path"]);
  assert.equal(routeMetadata(ended).config.title, "Item");
  assert.equal(routeMetadata(ended).config.redirect.to, target);
});

test("URL facts take only parent, params, search and fragments", () => {
  assert.throws(() => defineRoute("plain", { title: "x" }), /Unknown URL facts key: title/);
  assert.throws(() => defineRoute("plain", { resolve: {} }), /Unknown URL facts key: resolve/);
  assert.throws(() => defineRoute("plain", null), /URL facts must be an own record/);
});

const extensionRoot = resolve(
  import.meta.dirname,
  "../../../.scratch/router-extension",
  `${process.pid}`,
);

async function fixture() {
  await installExtension(extensionRoot);

  return import(resolve(extensionRoot, "node_modules/@fixture/route-extension/dist/index.js"));
}

test("an extension records root-first raw contributions and forwards them through router routes", async () => {
  const { defineRoute: extended, timing, needsUser } = await fixture();
  const context = () => ({ user: null });
  const procedures = ({ query }) => ({ inherited: { status: query(() => "ok") } });
  const parent = extended("parent", {}).context(context).procedures(procedures);
  const middle = defineRoute("middle", { parent }).title("middle");
  const narrow = () => ({ user: { id: "u" } });
  const child = extended("child", { parent: middle }).context(narrow).use(timing, needsUser);
  const stepless = extended("stepless", { parent: child });
  const empty = extended("empty", {}).use();

  const parentSlot = routeMetadata(parent).extension;
  const middleSlot = routeMetadata(middle).extension;
  const childSlot = routeMetadata(child).extension;

  assert.deepEqual(parentSlot.chain, [{ context, procedures }]);
  assert.equal(parentSlot.declared, true);
  // A router-made route forwards the same runtime and chain, undeclared.
  assert.equal(middleSlot.runtime, parentSlot.runtime);
  assert.equal(middleSlot.chain, parentSlot.chain);
  assert.equal(middleSlot.declared, false);
  assert.equal(childSlot.chain.length, 2);
  assert.equal(childSlot.chain[0], parentSlot.chain[0]);
  // Storage: one-argument steps keep their value's identity; others a frozen tuple.
  assert.equal(childSlot.chain[1].context, narrow);
  assert.deepEqual(childSlot.chain[1].use, [timing, needsUser]);
  assert.equal(Object.isFrozen(childSlot.chain[1].use), true);
  assert.deepEqual(routeMetadata(empty).extension.chain, [{ use: [] }]);
  // A step-less extension route adds no record: the parent's chain itself.
  assert.equal(routeMetadata(stepless).extension.chain, childSlot.chain);
  assert.equal(routeMetadata(stepless).extension.declared, true);

  for (const chain of [parentSlot.chain, childSlot.chain]) {
    assert.equal(Object.isFrozen(chain), true);

    for (const record of chain) {
      assert.equal(Object.isFrozen(record), true);
    }
  }

  assert.equal(routeContributions(extended, child), childSlot.chain);
  assert.equal(routeContributions(extended, middle), parentSlot.chain);
  assert.equal(
    routeContributions(createRouteFactory({ steps: [], input: () => ({}) }), child),
    undefined,
  );
  assert.equal(routeContributions(extended, defineRoute("plain", {})), undefined);
});

test("contributed steps come first, in manifest order, once each", async () => {
  const { defineRoute: extended, timing } = await fixture();
  const fresh = extended("fresh", {});

  assert.deepEqual(Object.keys(fresh), ["path"]);

  for (const name of ["context", "use", "procedures", "title", "canActivate"]) {
    assert.equal(typeof fresh[name], "function", name);
  }

  const used = fresh.use(timing);

  // Using a step drops it and every earlier one.
  assert.equal("use" in used, false);
  assert.equal("context" in used, false);
  assert.equal(typeof used.procedures, "function");

  // A router step closes the contributed steps.
  const routed = fresh.title("t");

  for (const name of ["context", "use", "procedures"]) {
    assert.equal(name in routed, false, name);
  }

  // Arity follows the manifest.
  assert.throws(() => fresh.context(), /^TypeError: Route step context takes 1…1 arguments$/);
  assert.throws(
    () =>
      fresh.context(
        () => ({}),
        () => ({}),
      ),
    /^TypeError: Route step context takes 1…1 arguments$/,
  );

  const unbounded = createRouteFactory({
    steps: [{ name: "many", serverOnly: false, arity: { min: 1, max: null } }],
    input: () => ({}),
  });

  assert.throws(
    () => unbounded("x", {}).many(),
    /^TypeError: Route step many takes at least 1 arguments$/,
  );
  assert.deepEqual(routeMetadata(unbounded("x", {}).many(1, 2, 3)).extension.chain, [
    { many: [1, 2, 3] },
  ]);
});

test("createRouteFactory validates its manifest", () => {
  const input = () => ({});
  const step = (name, overrides = {}) => ({
    name,
    serverOnly: true,
    arity: { min: 1, max: 1 },
    ...overrides,
  });

  for (const name of [
    "redirect",
    "title",
    "path",
    "then",
    "__params",
    "__search",
    "__data",
    "__title",
    "__contribution",
    // Object.prototype members: a route inherits them, so they'd survive their use.
    "__proto__",
    "toString",
    "constructor",
  ]) {
    assert.throws(
      () => createRouteFactory({ steps: [step(name)], input }),
      new RegExp(`Reserved contributed step name: ${name}`),
    );
  }

  assert.throws(
    () => createRouteFactory({ steps: [step("a"), step("a")], input }),
    /Duplicate contributed step name: a/,
  );
  assert.throws(
    () => createRouteFactory({ steps: [step("a", { serverOnly: "yes" })], input }),
    /serverOnly must be a boolean: a/,
  );

  for (const arity of [
    { min: -1, max: 1 },
    { min: 0.5, max: 1 },
    { min: 0, max: 0 },
    { min: 2, max: 1 },
  ]) {
    assert.throws(() => createRouteFactory({ steps: [step("a", { arity })], input }), /arity\./);
  }

  assert.throws(() => createRouteFactory({ steps: [], input: undefined }), TypeError);
});

test("one extension per ancestry; no input() runs at declaration", async () => {
  const { defineRoute: extended } = await fixture();
  let calls = 0;
  const other = createRouteFactory({
    steps: [{ name: "mark", serverOnly: false, arity: { min: 1, max: 1 } }],
    input: () => {
      calls += 1;

      return {};
    },
  });
  const parent = extended("parent", {}).context(() => ({}));
  const middle = defineRoute("middle", { parent });

  assert.throws(() => other("child", { parent }), /Route ancestry mixes route extensions/);
  assert.throws(() => other("child", { parent: middle }), /Route ancestry mixes route extensions/);

  const declared = other("own", {})
    .mark(1)
    .resolve({ value: () => 1 })
    .title(() => "t");

  defineRoute("below", { parent: declared }).canActivate([() => true]);
  assert.equal(calls, 0);
});

test("callback inputs reject extension members that shadow params or search", async () => {
  // The generated runtime needs Angular's compiler for its injectables outside a build.
  await import("@angular/compiler");

  const { callbackInputs } = await import("@loozo/angular-router/_generated");
  const shadowing = createRouteFactory({
    steps: [],
    input: () => ({ params: { forged: true } }),
  });
  const route = shadowing("shadow", {}).resolve({ value: () => 1 });
  const set = {
    records: { shadow: { definition: () => route, owners: ["shadow"] } },
    destinations: {},
    absolute: {},
    parents: {},
  };
  const snapshot = {
    routeConfig: { data: { __loozoAngularRouterRouteId: "shadow" } },
    queryParamMap: { getAll: () => [] },
    url: [],
  };

  snapshot.pathFromRoot = [snapshot];
  assert.throws(
    () => callbackInputs(set, "shadow", snapshot),
    /^TypeError: Route extension input cannot replace params or search$/,
  );
  // The failure is memoized for that snapshot and phase.
  assert.throws(() => callbackInputs(set, "shadow", snapshot), /cannot replace params or search/);
});

test("declaration emit names every child route's inferred type", async () => {
  await installExtension(extensionRoot);

  const files = {
    "parent.ts": `import { defineRoute } from "@loozo/angular-router";
export default defineRoute("parent", {}).title("Parent");
`,
    "child.ts": `import { defineRoute } from "@loozo/angular-router";
import parent from "./parent.js";
export default defineRoute("left", { parent });
`,
    "extended-parent.ts": `import { defineRoute, timing } from "@fixture/route-extension";
export default defineRoute("parent", {})
  .context(() => ({ count: 1 }))
  .use(timing)
  .procedures(({ query }) => ({ items: { count: query(({ context }) => context.count) } }));
`,
    "extended-child.ts": `import { defineRoute } from "@fixture/route-extension";
import parent from "./extended-parent.js";
export default defineRoute("child", { parent })
  .context(({ context }) => ({ doubled: context.count * 2 }))
  .title(({ rpc }) => String(rpc.items.count()));
`,
    // Uses no contributed step, so its type still offers the whole manifest.
    "extended-leaf.ts": `import { defineRoute } from "@fixture/route-extension";
import parent from "./extended-parent.js";
export default defineRoute("leaf", { parent }).title("Leaf");
`,
    "forwarding-child.ts": `import { defineRoute } from "@loozo/angular-router";
import parent from "./extended-parent.js";
export default defineRoute("forwarding", { parent });
`,
    "annotated-parent.ts": `import { defineRoute } from "@fixture/route-extension-annotated";
export default defineRoute("parent", {}).context(() => ({ count: 1 }));
`,
    "annotated-child.ts": `import { defineRoute } from "@fixture/route-extension-annotated";
import parent from "./annotated-parent.js";
export default defineRoute("child", { parent }).use();
`,
  };

  // Throws with the formatted diagnostics, such as TS4082 for a private name.
  await emitPackage(extensionRoot, "@fixture/declaration-emit", files);

  // The emitted declarations must stand on their own: no dangling or unreachable names.
  const output = resolve(extensionRoot, "node_modules/@fixture/declaration-emit/dist");
  const declarations = [];

  for (const file of Object.keys(files)) {
    declarations.push(resolve(output, file.replace(/\.ts$/, ".d.ts")));
  }

  const program = ts.createProgram(declarations, {
    strict: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: false,
    types: [],
  });
  const diagnostics = [];

  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    if (diagnostic.file?.fileName.startsWith(output)) {
      diagnostics.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    }
  }

  assert.deepEqual(diagnostics, []);
});

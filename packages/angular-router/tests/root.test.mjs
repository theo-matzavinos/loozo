import assert from "node:assert/strict";
import { test } from "node:test";
import * as root from "@loozo/angular-router";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import {
  authoredRouteOf,
  createRouteFactory,
  defineDestination,
  destinationRecord,
  routeContributions,
  routeMetadata,
  routeOf,
} from "@loozo/angular-router/_core";
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
    "serverRoutePath",
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

test("the old generated identity key name is ordinary native data", async () => {
  await import("@angular/compiler");

  const { nativeOptions } = await import("@loozo/angular-router/_generated");
  const data = { __loozoAngularRouterRouteId: "mine", other: 1 };
  const route = defineRoute("named", {}).data(data);
  const { config } = routeMetadata(route);
  const resolved = defineRoute("resolved", {}).resolve({ __loozoAngularRouterRouteId: () => 1 });

  assert.deepEqual(Reflect.ownKeys(config.data), ["__loozoAngularRouterRouteId", "other"]);
  assert.equal(config.data.__loozoAngularRouterRouteId, "mine");
  // Generated records forward the stored data object itself, with no key added.
  assert.equal(nativeOptions(route).data, config.data);
  assert.equal(routeMetadata(resolved).config.resolve.__loozoAngularRouterRouteId(), 1);
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
  const listFacts = {
    search: { tag: arrayParam(stringParam), q: stringParam, n: arrayParam(numberParam) },
  };
  const list = defineRoute("articles", listFacts);
  const listDestination = defineDestination("articles", listFacts, "articles");

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
      to: listDestination,
      search: { mode: "replace", values },
      fragment: { mode: "drop" },
    });
  }

  assert.throws(
    () =>
      defineRoute("old", {}).redirect({
        to: listDestination,
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
  const targetFacts = {
    params: { parts: stringParam },
    search: { q: stringParam },
    fragments: ["summary"],
  };
  const target = defineDestination("new/$parts[]", targetFacts, "new");
  const redirect = {
    to: target,
    params: { parts: "packed" },
    search: { mode: "replace", values: { q: "replacement" } },
    fragment: { mode: "replace", value: "summary" },
  };
  const source = defineRoute("old/$packed", { params: { packed: codec } }).redirect(redirect);

  assert.equal(createUrl(source, { params: { packed: ["a", "b"] } }), "/old/a%2Cb");
  assert.equal(calls, 0);

  // The snapshot keeps the destination itself.
  assert.equal(routeMetadata(source).config.redirect.to, target);

  // Only a genuine destination is a target: never a route, a spread or a fake.
  for (const to of [
    defineRoute("new/$parts[]", targetFacts),
    { ...target },
    Object.create(target),
    {},
    undefined,
  ]) {
    assert.throws(
      () => defineRoute("$packed", { params: { packed: codec } }).redirect({ ...redirect, to }),
      /^TypeError: Redirect target must be a genuine destination$/,
    );
  }

  for (const malformed of [
    { ...redirect, params: {} },
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
  const listFacts = { search: { page, sort: stringParam, q: stringParam } };
  const list = defineRoute("items", listFacts);

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
    defineRoute("old", {}).redirect({
      to: defineDestination("items", listFacts, "items"),
      search,
      fragment: { mode: "drop" },
    });
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
      to: defineDestination("object", { search: { [key]: codec } }, "object"),
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
    to: defineDestination("target", { search: { q: sentinel, box } }, "target"),
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

  const target = defineDestination("new", {}, "new");
  const ended = titled.redirect({
    to: target,
    search: { mode: "drop" },
    fragment: { mode: "drop" },
  });

  assert.deepEqual(Object.getOwnPropertyNames(ended), ["path"]);
  assert.equal(routeMetadata(ended).config.title, "Item");
  assert.equal(routeMetadata(ended).config.redirect.to, target);
});

test("URL facts take only parent, params, search, fragments and outlet", () => {
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

  return import(
    pathToFileURL(resolve(extensionRoot, "node_modules/@fixture/route-extension/dist/index.js"))
      .href
  );
}

test("an extension records root-first raw contributions and forwards them through router routes", async () => {
  const { defineRoute: extended, timing, needsUser } = await fixture();
  const context = () => ({ user: null });
  const remote = ({ query }) => ({ inherited: { status: query(() => "ok") } });
  const parent = extended("parent", {}).context(context).remote(remote);
  const middle = defineRoute("middle", { parent }).title("middle");
  const narrow = () => ({ user: { id: "u" } });
  const child = extended("child", { parent: middle }).context(narrow).use(timing, needsUser);
  const stepless = extended("stepless", { parent: child });
  const empty = extended("empty", {}).use();

  const parentSlot = routeMetadata(parent).extension;
  const middleSlot = routeMetadata(middle).extension;
  const childSlot = routeMetadata(child).extension;

  assert.deepEqual(parentSlot.chain, [{ context, remote }]);
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
    routeContributions(
      createRouteFactory({ steps: [], input: () => ({}), handle: () => ({}) }),
      child,
    ),
    undefined,
  );
  assert.equal(routeContributions(extended, defineRoute("plain", {})), undefined);
});

test("contributed steps come first, in manifest order, once each", async () => {
  const { defineRoute: extended, timing } = await fixture();
  const fresh = extended("fresh", {});

  assert.deepEqual(Object.keys(fresh), ["path"]);

  for (const name of ["context", "use", "remote", "title", "canActivate"]) {
    assert.equal(typeof fresh[name], "function", name);
  }

  const used = fresh.use(timing);

  // Using a step drops it and every earlier one.
  assert.equal("use" in used, false);
  assert.equal("context" in used, false);
  assert.equal(typeof used.remote, "function");

  // A router step closes the contributed steps.
  const routed = fresh.title("t");

  for (const name of ["context", "use", "remote"]) {
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
    handle: () => ({}),
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
  const handle = () => ({});
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
    "__outlet",
    "__contribution",
    // Object.prototype members: a route inherits them, so they'd survive their use.
    "__proto__",
    "toString",
    "constructor",
  ]) {
    assert.throws(
      () => createRouteFactory({ steps: [step(name)], input, handle }),
      new RegExp(`Reserved contributed step name: ${name}`),
    );
  }

  assert.throws(
    () => createRouteFactory({ steps: [step("a"), step("a")], input, handle }),
    /Duplicate contributed step name: a/,
  );
  assert.throws(
    () => createRouteFactory({ steps: [step("a", { serverOnly: "yes" })], input, handle }),
    /serverOnly must be a boolean: a/,
  );

  for (const arity of [
    { min: -1, max: 1 },
    { min: 0.5, max: 1 },
    { min: 0, max: 0 },
    { min: 2, max: 1 },
  ]) {
    assert.throws(
      () => createRouteFactory({ steps: [step("a", { arity })], input, handle }),
      /arity\./,
    );
  }

  assert.throws(() => createRouteFactory({ steps: [], input: undefined, handle }), TypeError);
  assert.throws(
    () => createRouteFactory({ steps: [], input }),
    /^TypeError: Route extension handle must be a function$/,
  );

  // The frozen runtime keeps the handle it was given, where every route's metadata reads it.
  const factory = createRouteFactory({ steps: [step("a")], input, handle });
  const runtime = routeMetadata(factory("x", {})).extension.runtime;

  assert.equal(runtime.handle, handle);
  assert.equal(Object.isFrozen(runtime), true);
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
    handle: () => ({}),
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

  const { callbacks, record } = await import("@loozo/angular-router/_generated");
  const shadowing = createRouteFactory({
    steps: [],
    input: () => ({ params: { forged: true } }),
    handle: () => ({}),
  });
  const destination = defineDestination("shadow", {}, "shadow");
  const route = routeOf(shadowing, destination).resolve({ value: () => 1 });
  const snapshot = {
    routeConfig: { ...record(destination) },
    queryParamMap: { getAll: () => [] },
    url: [],
  };

  snapshot.pathFromRoot = [snapshot];

  const { value } = callbacks(route).resolve;

  assert.throws(
    () => value(snapshot, {}),
    /^TypeError: Route extension input cannot replace params or search$/,
  );
  // The failure is memoized for that snapshot and phase.
  assert.throws(() => value(snapshot, {}), /cannot replace params or search/);
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
  .remote(({ query }) => ({ items: { count: query(({ context }) => context.count) } }));
`,
    "extended-child.ts": `import { defineRoute } from "@fixture/route-extension";
import parent from "./extended-parent.js";
export default defineRoute("child", { parent })
  .context(({ context }) => ({ doubled: context.count * 2 }))
  .title(({ remote }) => String(remote.items.count()));
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

// Destinations and route copies below are written by hand exactly as a
// destination.generated.ts and a route.generated.ts evaluate them.

test("a destination validates URL facts like defineRoute and evaluates no codec", () => {
  const throwing = {
    parse() {
      throw new Error("parsed");
    },
    stringify() {
      throw new Error("stringified");
    },
  };
  const org = defineDestination(
    "orgs/$orgId",
    { params: { orgId: throwing }, search: { tab: throwing }, fragments: ["top"] },
    "src/routes/orgs/$orgId/route.ts",
  );

  assert.deepEqual(Reflect.ownKeys(org), []);
  assert.equal(Object.isFrozen(org), true);
  assert.equal(destinationRecord(org).id, "src/routes/orgs/$orgId/route.ts");
  assert.equal(destinationRecord(org).path, "orgs/$orgId");
  assert.deepEqual(destinationRecord(org).url.fragments, ["top"]);

  // Same validation as defineRoute.
  assert.throws(
    () => defineDestination("$orgId", { parent: org, params: { orgId: numberParam } }, "x"),
    /Inherited param already owned: orgId/,
  );
  assert.throws(
    () => defineDestination("x", { parent: org, search: { tab: stringParam } }, "x"),
    /Inherited search already owned: tab/,
  );
  assert.throws(() => defineDestination("x", { title: "t" }, "x"), /Unknown URL facts key: title/);
  assert.throws(() => defineDestination("$id", {}, "x"), TypeError);
  assert.throws(
    () => defineDestination("$id", { params: { id: withFallback(numberParam, 1) } }, "x"),
    /withFallback codecs are search-only/,
  );

  const docs = defineDestination("docs/$rest[]", { params: { rest: stringParam } }, "docs");

  assert.throws(
    () => defineDestination("x", { parent: docs }, "x"),
    /Catchall declarations cannot have children/,
  );

  // A destination is not a route, and a destination's parent is a destination.
  const route = defineRoute("orgs/$orgId", { params: { orgId: numberParam } });

  assert.throws(() => routeMetadata(org), /Expected a genuine route from this package instance/);
  assert.throws(() => defineRoute("child", { parent: org }), /Expected a genuine route/);

  for (const parent of [route, { ...org }, Object.create(org), {}, null]) {
    assert.throws(
      () => defineDestination("x", { parent }, "x"),
      /^TypeError: Expected a genuine destination$/,
    );
  }

  for (const value of [route, { ...org }, Object.create(org), {}, null, undefined]) {
    assert.throws(() => destinationRecord(value), /^TypeError: Expected a genuine destination$/);
  }
});

test("a destination, its route copy and the inline declaration create the same URL", () => {
  const box = { parse: (raw) => ({ raw }), stringify: (value) => value.raw };
  const cases = [
    [
      "teams/$teamId",
      {
        params: { teamId: numberParam },
        search: { z: stringParam, page: withFallback(numberParam, 1) },
        fragments: ["top"],
      },
      { params: { teamId: 7 }, search: { z: "", page: 2 }, fragment: "top" },
    ],
    ["docs/$parts[]", { params: { parts: stringParam } }, { params: { parts: ["a b", "(c)"] } }],
    ["docs/$parts[]", { params: { parts: stringParam } }, { params: { parts: [] } }],
    ["$id/middle/$id", { params: { id: stringParam } }, { params: { id: "λ/(1)" } }],
    [
      "articles",
      { search: { tag: arrayParam(enumParam(["news", "guides"])), box, on: booleanParam } },
      { search: { tag: ["news", "news"], box: { raw: "x&y" }, on: false } },
    ],
    ["articles", { search: { tag: arrayParam(stringParam) } }, { search: { tag: [] } }],
    ["", {}, {}],
  ];

  for (const [path, facts, values] of cases) {
    const destination = defineDestination(path, facts, path);
    const copy = routeOf(defineRoute, destination).title("copy");
    const expected = createUrl(defineRoute(path, facts), values);

    assert.equal(createUrl(destination, values), expected);
    assert.equal(createUrl(copy, values), expected);
  }

  // Inherited through a pathless parent, with the same failures as a declaration.
  const team = defineDestination(
    "teams/$teamId",
    { params: { teamId: numberParam }, search: { q: stringParam } },
    "team",
  );
  const layout = defineDestination("", { parent: team }, "layout");
  const item = defineDestination(
    "items/$id",
    { parent: layout, params: { id: numberParam }, search: { score: numberParam } },
    "item",
  );

  assert.equal(
    createUrl(item, { params: { teamId: 1, id: 7 }, search: { score: 3 } }),
    "/teams/1/items/7?score=3",
  );
  assert.equal(
    createUrl(item, { params: { teamId: 1, id: 7 }, search: { q: "x" } }),
    "/teams/1/items/7?q=x",
  );
  assert.throws(() => createUrl(item, { params: { id: 7 } }), /Missing path value: teamId/);
  assert.throws(
    () => createUrl(item, { params: { teamId: 1, id: 7 }, fragment: "x" }),
    /Fragment must belong to this declaration/,
  );
  assert.throws(() => createUrl(layout, { params: { teamId: 1, id: 7 } }), /Unknown path values/);

  for (const fake of [
    undefined,
    null,
    {},
    { ...item },
    Object.create(item),
    { path: "items/$id" },
  ]) {
    assert.throws(
      () => createUrl(fake, {}),
      /^TypeError: Expected a genuine route or destination from this package instance$/,
    );
  }

  test("a destination with translated segments serializes them; types, path and copies stay canonical", async () => {
    const { nativePath, effectivePath } = await import("@loozo/angular-router/_generated");
    const product = defineDestination(
      "products/$id",
      { params: { id: numberParam } },
      "src/routes/products/$id/route.ts",
      ["produkte"],
    );
    const copy = routeOf(defineRoute, product);

    assert.equal(createUrl(product, { params: { id: 1 } }), "/produkte/1");
    assert.equal(createUrl(copy, { params: { id: 1 } }), "/produkte/1");
    assert.equal(destinationRecord(product).path, "products/$id");
    assert.equal(copy.path, "products/$id");

    // A child inherits the parent's translated text, then its own.
    const reviews = defineDestination(
      "reviews/all/$page",
      { parent: product, params: { page: numberParam } },
      "src/routes/products/$id/reviews/route.ts",
      ["bewertungen", "alle"],
    );

    assert.equal(
      createUrl(reviews, { params: { id: 1, page: 2 } }),
      "/produkte/1/bewertungen/alle/2",
    );
    assert.equal(nativePath(product), "produkte/:id");
    assert.equal(nativePath(reviews), "bewertungen/alle/:page");
    assert.equal(effectivePath(reviews), "produkte/:id/bewertungen/alle/:page");

    const docs = defineDestination("docs/$parts[]", { params: { parts: stringParam } }, "docs", [
      "dokumente",
    ]);

    assert.equal(nativePath(docs), "dokumente/**");
    assert.equal(root.serverRoutePath(docs), "dokumente/**");
    assert.equal(root.serverRoutePath(reviews), "produkte/:id/bewertungen/alle/:page");

    // Each translation must be one valid static segment, and there must be one per static segment.
    for (const text of ["", ".", "..", "*", "**", ":x", "$x", "a/b", "\uD800", 7]) {
      assert.throws(
        () => defineDestination("products/$id", { params: { id: numberParam } }, "bad", [text]),
        new TypeError(
          `Translated segment 1 of bad is not a valid static segment: ${JSON.stringify(text)}`,
        ),
      );
    }

    for (const segments of [[], ["a", "b"], "produkte"]) {
      assert.throws(
        () => defineDestination("products/$id", { params: { id: numberParam } }, "bad", segments),
        new TypeError("Translated segments of bad must list 1 static segments"),
      );
    }

    assert.throws(
      () => defineDestination("$id", { params: { id: numberParam } }, "bad", ["x"]),
      new TypeError("Translated segments of bad must list 0 static segments"),
    );

    // Omitted, a destination is exactly what it was.
    const plain = defineDestination("products/$id", { params: { id: numberParam } }, "plain");

    assert.equal(createUrl(plain, { params: { id: 1 } }), "/products/1");
    assert.equal(nativePath(plain), "products/:id");
  });

  test("serverRoutePath gives a destination's effective Angular pattern", () => {
    const home = defineDestination("", {}, "home");
    const team = defineDestination("teams/$teamId", { params: { teamId: numberParam } }, "team");
    const layout = defineDestination("", { parent: team }, "layout");
    const members = defineDestination("members", { parent: layout }, "members");
    const missing = defineDestination("$segments[]", { params: { segments: stringParam } }, "all");

    assert.equal(root.serverRoutePath(home), "");
    assert.equal(root.serverRoutePath(team), "teams/:teamId");
    assert.equal(root.serverRoutePath(layout), "teams/:teamId");
    assert.equal(root.serverRoutePath(members), "teams/:teamId/members");
    assert.equal(root.serverRoutePath(missing), "**");
    assert.throws(
      () => root.serverRoutePath(defineRoute("teams", {})),
      new TypeError("Expected a genuine destination"),
    );
    assert.throws(() => root.serverRoutePath({}), new TypeError("Expected a genuine destination"));
  });
});

test("routeOf builds a route copy from its destination and its parent's copy", () => {
  let parses = 0;
  const counted = {
    parse: (raw) => {
      parses += 1;

      return raw;
    },
    stringify: (value) => value,
  };
  const team = defineDestination("teams/$teamId", { params: { teamId: counted } }, "team");
  const item = defineDestination(
    "items/$id",
    { parent: team, params: { id: numberParam }, fragments: ["detail"] },
    "item",
  );
  const teamCopy = routeOf(defineRoute, team).resolve({ team: () => 1 });
  const itemStart = routeOf(defineRoute, item, teamCopy);
  const itemCopy = itemStart.canActivate([() => true]).title("Item");

  assert.equal(parses, 0);
  assert.equal(itemCopy.path, "items/$id");
  assert.deepEqual(Object.keys(itemCopy), ["path"]);
  assert.equal(Object.isFrozen(itemCopy), true);
  assert.equal("canActivate" in itemCopy, false);
  assert.equal(typeof itemStart.canActivate, "function");

  // Every stage keeps the destination, its canonical identity, and the parent copy.
  for (const stage of [itemStart, itemCopy]) {
    assert.equal(routeMetadata(stage).destination, item);
    assert.equal(routeMetadata(stage).parent, teamCopy);
  }

  assert.equal(routeMetadata(teamCopy).destination, team);
  assert.equal(routeMetadata(defineRoute("plain", {})).destination, undefined);
  // URL facts come from the destination.
  assert.deepEqual(Object.keys(routeMetadata(itemCopy).params), ["teamId", "id"]);
  assert.deepEqual(routeMetadata(itemCopy).fragments, ["detail"]);
  assert.equal(
    createUrl(itemCopy, { params: { teamId: "t", id: 2 }, fragment: "detail" }),
    "/teams/t/items/2#detail",
  );

  // A copy is a route, not a destination.
  assert.throws(() => destinationRecord(itemCopy), /^TypeError: Expected a genuine destination$/);
  assert.throws(
    () => defineDestination("x", { parent: itemCopy }, "x"),
    /^TypeError: Expected a genuine destination$/,
  );
  assert.throws(
    () =>
      defineRoute("x", {}).redirect({
        to: itemCopy,
        search: { mode: "drop" },
        fragment: { mode: "drop" },
      }),
    /^TypeError: Redirect target must be a genuine destination$/,
  );

  // The parent must be the copy of the destination's parent.
  const other = defineDestination("other", {}, "other");
  const otherCopy = routeOf(defineRoute, other);

  for (const parent of [
    otherCopy,
    defineRoute("teams/$teamId", { params: { teamId: counted } }),
    undefined,
  ]) {
    assert.throws(
      () => routeOf(defineRoute, item, parent),
      /^TypeError: Route copy parent does not match its destination$/,
    );
  }

  assert.throws(
    () => routeOf(defineRoute, other, teamCopy),
    /^TypeError: Route copy parent does not match its destination$/,
  );
  assert.throws(
    () => routeOf(defineRoute, item, team),
    /^TypeError: Expected a genuine route from this package instance$/,
  );

  for (const destination of [itemCopy, { ...item }, Object.create(item), {}, undefined]) {
    assert.throws(
      () => routeOf(defineRoute, destination),
      /^TypeError: Expected a genuine destination$/,
    );
  }

  for (const factory of [() => otherCopy, undefined, {}, defineRoute.bind(null)]) {
    assert.throws(() => routeOf(factory, other), /^TypeError: Expected a route factory$/);
  }
});

test("routeOf with an extension factory keeps contributed steps and ancestry", async () => {
  const { defineRoute: extended } = await fixture();
  const context = () => ({ user: null });
  const remote = ({ query }) => ({ items: { list: query(() => []) } });
  const parent = defineDestination("parent", {}, "parent");
  const child = defineDestination("child", { parent }, "child");
  const leaf = defineDestination("leaf", { parent: child }, "leaf");
  const parentCopy = routeOf(extended, parent).context(context);
  const childStart = routeOf(extended, child, parentCopy);

  for (const name of ["context", "use", "remote", "title"]) {
    assert.equal(typeof childStart[name], "function", name);
  }

  const childCopy = childStart.remote(remote).title("t");
  const childSlot = routeMetadata(childCopy).extension;

  assert.deepEqual(childSlot.chain, [{ context }, { remote }]);
  assert.equal(childSlot.declared, true);
  assert.equal(routeContributions(extended, childCopy), childSlot.chain);
  assert.equal(routeMetadata(childCopy).destination, child);

  // A router copy below forwards the slot, undeclared.
  const leafCopy = routeOf(defineRoute, leaf, childCopy);

  assert.equal(routeMetadata(leafCopy).extension.chain, childSlot.chain);
  assert.equal(routeMetadata(leafCopy).extension.declared, false);

  const other = createRouteFactory({ steps: [], input: () => ({}), handle: () => ({}) });

  assert.throws(() => routeOf(other, child, parentCopy), /Route ancestry mixes route extensions/);
});

test("authoredRouteOf copies end their chain with their own data and offer no contributed step", async () => {
  const { defineRoute: extended } = await fixture();
  const parent = defineDestination("parent", {}, "parent");
  const child = defineDestination("child", { parent }, "child");
  const leaf = defineDestination("leaf", { parent: child }, "leaf");
  const parentData = { remote: { session: ["current"] } };
  const childData = { remote: { todos: ["list"] } };
  const parentCopy = authoredRouteOf()(extended, parent, undefined, parentData);
  const childCopy = authoredRouteOf()(extended, child, parentCopy, childData).title("t");
  const parentChain = routeMetadata(parentCopy).extension.chain;
  const childSlot = routeMetadata(childCopy).extension;

  assert.deepEqual(parentChain, [parentData]);
  assert.equal(childSlot.chain.length, 2);
  assert.equal(childSlot.chain[0], parentChain[0]);
  assert.deepEqual(childSlot.chain[1], childData);
  assert.equal(childSlot.declared, true);
  assert.equal(Object.isFrozen(childSlot.chain), true);
  assert.equal(Object.isFrozen(childSlot.chain[1]), true);
  assert.notEqual(childSlot.chain[1], childData);
  assert.equal(routeMetadata(childCopy).destination, child);

  // The own record closes the contributed steps; the router's stay.
  const start = authoredRouteOf()(extended, leaf, childCopy, { remote: {} });

  for (const name of ["context", "use", "remote"]) {
    assert.equal(name in start, false, name);
  }

  assert.equal(typeof start.resolve, "function");

  // Without data, the copy adds no record: routeOf's chain.
  const bare = authoredRouteOf()(extended, leaf, childCopy);

  assert.equal(routeMetadata(bare).extension.chain, childSlot.chain);
  assert.equal(typeof bare.context, "function");

  for (const own of [null, [], "data", new Map(), Object.create({ inherited: true })]) {
    assert.throws(
      () => authoredRouteOf()(extended, parent, undefined, own),
      /^TypeError: Route copy own record must be a plain record$/,
    );
  }

  assert.throws(
    () => authoredRouteOf()(defineRoute, parent),
    /^TypeError: An authored route copy needs a route extension factory$/,
  );
  assert.throws(() => authoredRouteOf()({}, parent), /^TypeError: Expected a route factory$/);
});

test("a destination redirect snapshots its policies and its adapter reads the destination", async () => {
  await import("@angular/compiler");

  const { Injector, runInInjectionContext } = await import("@angular/core");
  const { Router } = await import("@angular/router");
  const { redirect } = await import("@loozo/angular-router/_generated");
  const org = defineDestination("orgs/$orgId", { params: { orgId: numberParam } }, "org");
  const layout = defineDestination("", { parent: org }, "layout");
  const item = defineDestination(
    "items/$itemId",
    {
      parent: layout,
      params: { itemId: numberParam },
      search: { q: numberParam },
      fragments: ["detail"],
    },
    "item",
  );
  const old = defineDestination(
    "old/$orgId/$id",
    { params: { orgId: numberParam, id: numberParam } },
    "old",
  );
  const oldCopy = routeOf(defineRoute, old).redirect({
    to: item,
    params: { orgId: "orgId", itemId: "id" },
    search: { mode: "replace", values: { q: 7 } },
    fragment: { mode: "replace", value: "detail" },
  });
  const snapshot = routeMetadata(oldCopy).config.redirect;

  assert.equal(snapshot.to, item);
  assert.deepEqual({ ...snapshot.params }, { orgId: "orgId", itemId: "id" });
  assert.deepEqual(snapshot.search, { mode: "replace", values: { q: 7 } });
  assert.deepEqual(snapshot.fragment, { mode: "replace", value: "detail" });
  // Mapping and replacement checks read the destination's URL facts.
  assert.throws(
    () =>
      routeOf(defineRoute, old).redirect({
        to: item,
        search: { mode: "drop" },
        fragment: { mode: "drop" },
      }),
    /Cannot forward redirect param: itemId/,
  );
  assert.throws(
    () =>
      routeOf(defineRoute, old).redirect({
        to: item,
        params: { orgId: "orgId", itemId: "id" },
        search: { mode: "replace", values: { other: 1 } },
        fragment: { mode: "drop" },
      }),
    TypeError,
  );

  const router = { parseUrl: (url) => ({ url }) };
  const injector = Injector.create({ providers: [{ provide: Router, useValue: router }] });
  const tree = runInInjectionContext(injector, () =>
    redirect(oldCopy)({
      url: [{ path: "old" }, { path: "6" }, { path: "11" }],
      queryParams: { dropped: "x" },
      fragment: "dropped",
    }),
  );

  assert.equal(tree.url, "/orgs/6/items/11");
  assert.deepEqual({ ...tree.queryParams }, { q: "7" });
  assert.equal(tree.fragment, "detail");
});

test("generated callbacks and handles run on route copies without a route set", async () => {
  await import("@angular/compiler");

  const {
    callbacks,
    createDestinationHandle,
    record: facts,
  } = await import("@loozo/angular-router/_generated");
  const counts = { orgId: 0, itemId: 0 };
  const counted = (key) => ({
    parse: (raw) => {
      counts[key] += 1;

      return Number(raw);
    },
    stringify: (value) => String(value),
  });
  const org = defineDestination("orgs/$orgId", { params: { orgId: counted("orgId") } }, "org");
  const layout = defineDestination("", { parent: org }, "layout");
  const item = defineDestination(
    "items/$itemId",
    { parent: layout, params: { itemId: counted("itemId") }, fragments: ["detail"] },
    "item",
  );
  const docs = defineDestination("docs/$rest[]", { params: { rest: stringParam } }, "docs");
  const seen = [];
  const orgCopy = routeOf(defineRoute, org)
    .canActivate([(inputs) => seen.push(["org", inputs])])
    .canActivateChild([(inputs, child) => seen.push(["orgChild", inputs, child])]);
  const layoutCopy = routeOf(defineRoute, layout, orgCopy).resolve({ group: () => "g" });
  const itemResolved = routeOf(defineRoute, item, layoutCopy).resolve({
    answer: (inputs) => seen.push(["resolve", inputs]),
  });
  const itemCopy = itemResolved.canActivate([(inputs) => seen.push(["item", inputs])]);

  // Angular's root record, a hand-written native wrapper without facts, then the
  // generated records, each carrying its own destination.
  function record(destination, paths, parent) {
    const snapshot = {
      routeConfig: destination === undefined ? null : { ...facts(destination) },
      url: paths.map((path) => ({ path })),
      queryParamMap: { getAll: () => [] },
    };

    snapshot.pathFromRoot = [...(parent?.pathFromRoot ?? []), snapshot];

    return snapshot;
  }

  const root = record(undefined, []);
  const wrapper = record(undefined, [], root);
  const orgRecord = record(org, ["orgs", "4"], wrapper);
  const layoutRecord = record(layout, [], orgRecord);
  const itemRecord = record(item, ["items", "8"], layoutRecord);

  callbacks(itemCopy).canActivate[0](itemRecord, {});
  // An earlier stage of the same copy shares the parse: it's keyed by the destination.
  callbacks(itemResolved).resolve.answer(itemRecord, {});
  callbacks(orgCopy).canActivate[0](orgRecord, {});
  callbacks(orgCopy).canActivateChild[0](itemRecord, {});

  const [item1, resolved, org1, orgChild] = seen;

  assert.deepEqual({ ...item1[1].params }, { orgId: 4, itemId: 8 });
  assert.equal(resolved[1], item1[1]);
  assert.deepEqual({ ...org1[1].params }, { orgId: 4 });
  // canActivateChild reads its declaring record's inputs and gets the native child.
  assert.equal(orgChild[1], org1[1]);
  assert.equal(orgChild[2], itemRecord);
  // One parse per route and snapshot: item's full parse, then org's own.
  assert.deepEqual(counts, { orgId: 2, itemId: 1 });

  // Ancestry comes from parent links: each parent destination pairs with the nearest
  // generated ancestor record, and a missing one fails with that ancestor's id.
  const orphanLayout = record(layout, [], wrapper);
  const orphan = record(item, ["items", "9"], orphanLayout);

  assert.throws(
    () => callbacks(itemCopy).canActivate[0](orphan, {}),
    /^Error: Generated route ancestor missing: org$/,
  );
  assert.throws(
    () => callbacks(itemCopy).canActivate[0](orgRecord, {}),
    /^Error: Generated route wiring identity mismatch: item$/,
  );
  assert.throws(
    () => callbacks(defineRoute("plain", {}).title(() => "t")),
    /^TypeError: Expected a generated route copy$/,
  );

  // Handles resolve `to` against their own destination, its `..` destination and genuine
  // destinations, and compose with the URL `base` returns.
  const { DefaultUrlSerializer } = await import("@angular/router");
  const serializer = new DefaultUrlSerializer();
  const router = {
    parseUrl: (url) => serializer.parse(url),
    navigateByUrl: (tree, options) => Promise.resolve({ url: serializer.serialize(tree), options }),
  };
  const base = () => serializer.parse("/");
  const view = { params: null, search: null, data: null, title: null };
  const handle = createDestinationHandle(item, layout, router, view, base);
  const href = (tree) => serializer.serialize(tree);

  assert.equal(
    href(handle.link({ params: { orgId: 4, itemId: 8 }, fragment: "detail" })),
    "/orgs/4/items/8#detail",
  );
  assert.equal(href(handle.link({ to: "..", params: { orgId: 4 } })), "/orgs/4");
  assert.equal(href(handle.link({ to: docs, params: { rest: ["a", "b"] } })), "/docs/a/b");
  assert.deepEqual(await handle.navigate({ to: org, params: { orgId: 5 }, replaceUrl: true }), {
    url: "/orgs/5",
    options: { replaceUrl: true },
  });
  assert.throws(
    () => handle.link({ to: "/orgs/$orgId", params: { orgId: 4 } }),
    /^TypeError: Unknown generated selector: \/orgs\/\$orgId$/,
  );
  assert.throws(
    () =>
      createDestinationHandle(org, undefined, router, view, base).link({ to: "..", params: {} }),
    /^TypeError: Unknown generated selector: \.\.$/,
  );

  for (const to of [{ ...docs }, Object.create(docs), {}, itemCopy, null]) {
    assert.throws(
      () => handle.link({ to, params: { rest: ["a"] } }),
      /^TypeError: Expected a genuine destination$/,
    );
  }
});

test("extension record stamps carry the copy's runtime and chain, and handle members stay lazy", async () => {
  await import("@angular/compiler");

  const { addMembers, extension, recordExtension } =
    await import("@loozo/angular-router/_generated");
  const { defineRoute: extended } = await fixture();
  const parent = defineDestination("parent", {}, "parent");
  const child = defineDestination("child", { parent }, "child");
  const parentCopy = authoredRouteOf()(extended, parent, undefined, { remote: { a: ["b"] } });
  const slot = routeMetadata(parentCopy).extension;
  // Angular's shallow record copies keep own enumerable symbols.
  const config = { path: "parent", ...extension(parentCopy) };

  assert.deepEqual(recordExtension({ ...config }), { runtime: slot.runtime, chain: slot.chain });
  assert.equal(recordExtension({ path: "native" }), undefined);
  assert.equal(recordExtension(null), undefined);

  // Only a copy an extension's factory made is stamped; a router copy below forwards undeclared.
  for (const copy of [routeOf(defineRoute, child, parentCopy), routeOf(defineRoute, parent)]) {
    assert.throws(
      () => extension(copy),
      /^TypeError: Route extension stamp needs an extension route copy$/,
    );
  }

  let reads = 0;
  const runtime = {
    handle: (chain, injector) => ({
      get member() {
        reads += 1;

        return { chain, injector };
      },
    }),
  };
  const handle = { params: "own" };
  const injector = {};

  addMembers(handle, runtime, slot.chain, injector);
  assert.equal(reads, 0);
  assert.equal(typeof Object.getOwnPropertyDescriptor(handle, "member").get, "function");
  assert.deepEqual(handle.member, { chain: slot.chain, injector });
  assert.equal(reads, 1);
});

test("outlet facts: names, nesting, paths and primary-owned query and fragment", () => {
  const products = defineRoute("products", { search: { sort: stringParam } });

  for (const outlet of ["primary", "1chat", "chat:x", "chat/x", "", 7, null]) {
    assert.throws(
      () => defineRoute("chat", { outlet }),
      /^TypeError: Outlet name must be a letter followed by letters, digits, '-' or '_', and not "primary": /,
    );
  }

  const chat = defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });

  assert.throws(
    () => defineRoute("x", { parent: chat, outlet: "aside" }),
    /^TypeError: Named outlets don't nest: the parent is in outlet chat$/,
  );
  assert.throws(
    () => defineRoute("", { parent: products, outlet: "detail" }),
    /^TypeError: A named-outlet route needs a path: an empty one activates with its anchor and can't be closed$/,
  );

  for (const facts of [
    { outlet: "chat", search: { q: stringParam } },
    { outlet: "chat", fragments: ["top"] },
    { parent: chat, search: {} },
    { parent: chat, fragments: [] },
  ]) {
    assert.throws(
      () => defineRoute("x", facts),
      /^TypeError: Routes in a named outlet can't declare search or fragments: the query and fragment belong to the primary route$/,
    );
  }

  // The anchor is the parent's accumulated primary segments; descendants inherit it.
  const teams = defineRoute("teams/$teamId", { params: { teamId: numberParam } });
  const item = defineRoute("item/$id", {
    parent: teams,
    outlet: "detail",
    params: { id: numberParam },
  });
  const specs = defineRoute("specs", { parent: item });

  assert.deepEqual(routeMetadata(item).branch, {
    outlet: "detail",
    anchor: [
      { kind: "static", text: "teams" },
      { kind: "scalar", name: "teamId" },
    ],
  });
  assert.deepEqual(routeMetadata(item).segments, [
    { kind: "static", text: "item" },
    { kind: "scalar", name: "id" },
  ]);
  assert.equal(routeMetadata(specs).branch, routeMetadata(item).branch);
  assert.deepEqual(
    routeMetadata(specs).segments.map((segment) => segment.text ?? segment.name),
    ["item", "id", "specs"],
  );
  assert.deepEqual(Object.keys(routeMetadata(specs).params), ["teamId", "id"]);
  assert.ok(Object.isFrozen(routeMetadata(item).branch.anchor));

  // A pathless primary parent adds no anchor segment.
  const account = defineRoute("account", {});
  const layout = defineRoute("", { parent: account });
  const help = defineRoute("help", { parent: layout, outlet: "aside" });

  assert.deepEqual(routeMetadata(help).branch.anchor, [{ kind: "static", text: "account" }]);
  assert.equal(routeMetadata(products).branch, undefined);
});

test("branch destinations: their own URL below the anchor, params only, a nonempty group", async () => {
  const { serverRoutePath } = root;
  const products = defineDestination("products", { search: { sort: stringParam } }, "products");
  const item = defineDestination(
    "item/$id",
    { parent: products, outlet: "detail", params: { id: numberParam } },
    "item",
  );
  const panel = defineDestination("panel", { parent: products, outlet: "detail" }, "panel");
  const panelRest = defineDestination(
    "$rest[]",
    { parent: panel, params: { rest: stringParam } },
    "panelRest",
  );
  const chat = defineDestination(
    "chat/$id",
    { outlet: "chat", params: { id: numberParam } },
    "chat",
  );
  const chatRest = defineDestination(
    "$rest[]",
    { outlet: "chat", params: { rest: stringParam } },
    "chatRest",
  );
  const nestedRest = defineDestination(
    "$rest[]",
    { parent: products, outlet: "detail", params: { rest: stringParam } },
    "nestedRest",
  );
  const files = defineDestination(
    "files/$rest[]",
    { outlet: "chat", params: { rest: stringParam } },
    "files",
  );
  const odd = defineDestination("a(b)", { outlet: "chat" }, "odd");

  assert.equal(createUrl(chat, { params: { id: 7 } }), "/(chat:chat/7)");
  assert.equal(createUrl(item, { params: { id: 3 } }), "/products/(detail:item/3)");
  assert.equal(createUrl(chatRest, { params: { rest: ["a", "b"] } }), "/(chat:a/b)");
  assert.equal(createUrl(odd, {}), "/(chat:a%28b%29)");
  assert.equal(createUrl(chatRest, { params: { rest: ["(x)"] } }), "/(chat:%28x%29)");

  // Only a catchall-only branch root with an empty array has an empty group.
  assert.equal(createUrl(panelRest, { params: { rest: [] } }), "/products/(detail:panel)");
  assert.equal(createUrl(files, { params: { rest: [] } }), "/(chat:files)");
  assert.throws(
    () => createUrl(chatRest, { params: { rest: [] } }),
    /^TypeError: A destination in outlet chat needs at least one path segment: chatRest$/,
  );
  assert.throws(
    () => createUrl(nestedRest, { params: { rest: [] } }),
    /^TypeError: A destination in outlet detail needs at least one path segment: nestedRest$/,
  );

  for (const values of [
    { params: { id: 3 }, search: {} },
    { params: { id: 3 }, search: { sort: "a" } },
    { params: { id: 3 }, fragment: "x" },
  ]) {
    assert.throws(
      () => createUrl(item, values),
      /^TypeError: A destination in outlet detail takes params only$/,
    );
  }

  // Routes and destinations agree; an authored route names itself by its path.
  const route = defineRoute("$rest[]", { outlet: "chat", params: { rest: stringParam } });

  assert.throws(
    () => createUrl(route, { params: { rest: [] } }),
    /^TypeError: A destination in outlet chat needs at least one path segment: "\$rest\[\]"$/,
  );

  assert.throws(
    () => serverRoutePath(chat),
    /^TypeError: serverRoutePath\(chat\): a destination in outlet chat has no server path; named-outlet URLs match the \*\* server route$/,
  );
  assert.equal(serverRoutePath(products), "products");

  // A translated build: the anchor is the parent's translated text, translated once, and a
  // descendant inherits it unchanged.
  const produits = defineDestination("products", {}, "produits", ["produits"]);
  const article = defineDestination(
    "item/$id",
    { parent: produits, outlet: "detail", params: { id: numberParam } },
    "article",
    ["artikel"],
  );
  const specs = defineDestination("specs", { parent: article }, "specs", ["details"]);

  assert.deepEqual(destinationRecord(article).url.branch.anchor, [
    { kind: "static", text: "produits" },
  ]);
  assert.equal(destinationRecord(specs).url.branch, destinationRecord(article).url.branch);
  assert.equal(createUrl(article, { params: { id: 3 } }), "/produits/(detail:artikel/3)");
  assert.equal(createUrl(specs, { params: { id: 3 } }), "/produits/(detail:artikel/3/details)");
});

test("branch redirects replace the URL with the destination's and keep their query policy", async () => {
  await import("@angular/compiler");

  const { redirect } = await import("@loozo/angular-router/_generated");
  const { DefaultUrlSerializer } = await import("@angular/router");
  const { Injector, runInInjectionContext } = await import("@angular/core");
  const { Router } = await import("@angular/router");
  const serializer = new DefaultUrlSerializer();
  const injector = Injector.create({
    providers: [{ provide: Router, useValue: { parseUrl: (url) => serializer.parse(url) } }],
  });
  const products = defineDestination("products", { search: { sort: stringParam } }, "products");
  const item = defineDestination(
    "item/$id",
    { parent: products, outlet: "detail", params: { id: numberParam } },
    "item",
  );
  const chatRest = defineDestination(
    "$rest[]",
    { outlet: "chat", params: { rest: stringParam } },
    "chatRest",
  );
  const snapshot = {
    url: [{ path: "old-item" }, { path: "3" }],
    queryParams: { sort: "name", x: "1" },
    fragment: "top",
  };
  const run = (search) => {
    const source = routeOf(
      defineRoute,
      defineDestination("old-item/$id", { params: { id: numberParam } }, `old-${search.mode}`),
    ).redirect({
      to: item,
      search,
      fragment: { mode: "drop" },
    });

    return serializer.serialize(runInInjectionContext(injector, () => redirect(source)(snapshot)));
  };

  assert.equal(
    run({ mode: "replace", values: { sort: "price" } }),
    "/products/(detail:item/3)?sort=price",
  );
  assert.equal(run({ mode: "replace", values: {} }), "/products/(detail:item/3)");
  assert.equal(run({ mode: "preserve" }), "/products/(detail:item/3)?sort=name&x=1");
  assert.equal(run({ mode: "drop" }), "/products/(detail:item/3)");

  // Into a root-level branch, the tree carries the empty primary group Angular's split of a
  // fresh URL gives a prefix empty-path primary route, and only where the root config has one.
  const chat = defineDestination(
    "chat/$id",
    { outlet: "chat", params: { id: numberParam } },
    "chat",
  );
  const intoChat = (config, policies) => {
    const source = routeOf(
      defineRoute,
      defineDestination("old-chat/$id", { params: { id: numberParam } }, "old-chat"),
    ).redirect({ to: chat, ...policies });
    const routerWith = Injector.create({
      providers: [
        { provide: Router, useValue: { config, parseUrl: (url) => serializer.parse(url) } },
      ],
    });

    return runInInjectionContext(routerWith, () =>
      redirect(source)({
        url: [{ path: "old-chat" }, { path: "7" }],
        queryParams: { x: "1" },
        fragment: "f",
      }),
    );
  };
  const dropped = { search: { mode: "drop" }, fragment: { mode: "drop" } };
  const withPrimary = intoChat([{ path: "" }, { path: "**" }], dropped);

  assert.deepEqual(Object.keys(withPrimary.root.children), ["primary", "chat"]);
  assert.equal(withPrimary.root.children.primary.segments.length, 0);
  assert.equal(withPrimary.root.children.primary.hasChildren(), false);
  assert.equal(withPrimary.root.children.chat.parent, withPrimary.root);
  assert.equal(serializer.serialize(withPrimary), "/(chat:chat/7)");
  assert.equal(
    serializer.serialize(
      intoChat([{ path: "", outlet: "primary" }], {
        search: { mode: "preserve" },
        fragment: { mode: "preserve" },
      }),
    ),
    "/(chat:chat/7)?x=1#f",
  );

  for (const config of [
    [],
    [{ path: "**" }],
    [{ path: "", pathMatch: "full" }],
    [{ path: "", outlet: "chat" }],
    [{ path: "home" }],
  ]) {
    const tree = intoChat(config, dropped);

    assert.deepEqual(Object.keys(tree.root.children), ["chat"], JSON.stringify(config));
  }

  // A nested branch's tree already has its primary group.
  assert.deepEqual(Object.keys(serializer.parse(run({ mode: "drop" })).root.children), ["primary"]);

  const empty = routeOf(
    defineRoute,
    defineDestination("gone/$rest[]", { params: { rest: stringParam } }, "gone"),
  ).redirect({
    to: chatRest,
    search: { mode: "drop" },
    fragment: { mode: "drop" },
  });

  assert.throws(
    () =>
      runInInjectionContext(injector, () =>
        redirect(empty)({ url: [{ path: "gone" }], queryParams: {}, fragment: null }),
      ),
    /^TypeError: A destination in outlet chat needs at least one path segment: chatRest$/,
  );
});

test("onlyAtEnd canMatch adapters refuse longer URLs before building any input", async () => {
  await import("@angular/compiler");

  const { callbacks, record } = await import("@loozo/angular-router/_generated");
  let parsed = 0;
  let called = 0;
  const counted = { parse: (raw) => ((parsed += 1), raw), stringify: (value) => value };
  const home = defineDestination("", { search: { q: counted } }, "home");
  const copy = routeOf(defineRoute, home).canMatch([
    () => {
      called += 1;

      return true;
    },
  ]);
  const gated = callbacks(copy, { onlyAtEnd: true }).canMatch;
  // Angular passes one partial snapshot to all of a candidate's canMatch guards.
  const snapshot = () => ({
    routeConfig: { ...record(home) },
    url: [],
    queryParamMap: { getAll: () => ["x"] },
  });
  const longer = snapshot();

  assert.equal(gated.length, 2);

  for (const guard of gated) {
    assert.equal(guard({}, [{ path: "products" }], longer), false);
  }

  assert.deepEqual({ parsed, called }, { parsed: 0, called: 0 });

  const end = snapshot();

  for (const guard of gated) {
    assert.equal(guard({}, [], end), true);
  }

  assert.deepEqual({ parsed, called }, { parsed: 1, called: 1 });

  // Without it, the same adapters run on any URL.
  const ungated = snapshot();

  for (const guard of callbacks(copy).canMatch) {
    guard({}, [{ path: "products" }], ungated);
  }

  assert.equal(called, 2);

  // A route an extension's factory made builds its extension input only where the leaf ends
  // the primary path too.
  let inputs = 0;
  const seen = [];
  const extended = createRouteFactory({
    steps: [],
    input: () => {
      inputs += 1;

      return { extra: true };
    },
    handle: () => ({}),
  });
  const extendedGated = callbacks(
    routeOf(extended, home).canMatch([
      (input) => {
        seen.push(input.extra);

        return true;
      },
    ]),
    { onlyAtEnd: true },
  ).canMatch;
  const extendedLonger = snapshot();

  for (const guard of extendedGated) {
    assert.equal(guard({}, [{ path: "products" }], extendedLonger), false);
  }

  assert.deepEqual({ inputs, seen }, { inputs: 0, seen: [] });

  const extendedEnd = snapshot();

  for (const guard of extendedGated) {
    assert.equal(guard({}, [], extendedEnd), true);
  }

  assert.deepEqual({ inputs, seen }, { inputs: 1, seen: [true] });
});

test("owned admits only the segments a group's claims fit, ahead of adapters that refuse before building any input", async () => {
  await import("@angular/compiler");

  const { callbacks, owned, record, resolverKeys } =
    await import("@loozo/angular-router/_generated");
  let parsed = 0;
  let called = 0;
  const counted = { parse: (raw) => ((parsed += 1), raw), stringify: (value) => value };
  const group = defineDestination("", { search: { q: counted } }, "group");
  const copy = routeOf(defineRoute, group)
    .canMatch([
      () => {
        called += 1;

        return true;
      },
    ])
    .canActivate([() => true])
    .resolve({ user: () => "ada" })
    .title("Group");
  const base = callbacks(copy);
  const claimed = owned([["inbox"], [], ["teams", ":"], ["docs", "**"], ["a b"]], base);
  const snapshot = () => ({
    routeConfig: { ...record(group) },
    url: [],
    queryParamMap: { getAll: () => ["x"] },
  });
  const segments = (...paths) => paths.map((path) => ({ path, parameters: {} }));
  // Whether every guard admits, as Angular decides a candidate.
  const admits = (url) => {
    const shared = snapshot();
    let all = true;

    for (const guard of claimed.canMatch) {
      if (guard({}, url, shared) !== true) {
        all = false;
      }
    }

    return all;
  };

  assert.equal(claimed.canMatch.length, base.canMatch.length + 1);

  // Nothing fits: no adapter builds inputs or calls its callback.
  for (const url of [
    segments("profile"),
    segments("Inbox"),
    segments("teams"),
    segments("teams", "1", "2"),
    segments("doc"),
    segments("inbox", "x"),
  ]) {
    assert.equal(admits(url), false, JSON.stringify(url));
  }

  assert.deepEqual({ parsed, called }, { parsed: 0, called: 0 });

  // `[]` admits only the bare URL, ":" exactly one segment, "**" zero or more after its prefix;
  // paths compare decoded and exactly, matrix params aside.
  for (const url of [
    [],
    segments("inbox"),
    [{ path: "inbox", parameters: { view: "compact" } }],
    segments("teams", "42"),
    segments("docs"),
    segments("docs", "a", "b"),
    segments("a b"),
  ]) {
    assert.equal(admits(url), true, JSON.stringify(url));
  }

  assert.equal(called, 7);

  // Every other field passes through, the resolver stamp included.
  assert.equal(claimed.canActivate, base.canActivate);
  assert.equal(claimed.resolve, base.resolve);
  assert.equal(claimed.title, "Group");
  assert.deepEqual(resolverKeys(claimed), ["user"]);

  // A group without matching callbacks still gets the ownership guard, and nothing else.
  const bare = owned([["profile"]]);

  assert.deepEqual(Object.keys(bare), ["canMatch"]);
  assert.equal(bare.canMatch.length, 1);
  assert.equal(bare.canMatch[0]({}, segments("profile"), snapshot()), true);
  assert.equal(bare.canMatch[0]({}, [], snapshot()), false);
  assert.equal(owned([]).canMatch[0]({}, [], snapshot()), false);
});

test("handles close branches by metadata and take params only in a named outlet", async () => {
  await import("@angular/compiler");

  const { createDestinationHandle } = await import("@loozo/angular-router/_generated");
  const { DefaultUrlSerializer } = await import("@angular/router");
  const serializer = new DefaultUrlSerializer();
  const navigations = [];
  const router = {
    parseUrl: (url) => serializer.parse(url),
    navigateByUrl: (tree, options) => {
      navigations.push([serializer.serialize(tree), options]);

      return Promise.resolve(false);
    },
  };
  let current = "/products/(list//detail:item/3)(chat:chat/7)?sort=price";
  const base = () => serializer.parse(current);
  const view = { params: null, search: null, data: null, title: null };
  const products = defineDestination("products", { search: { sort: stringParam } }, "products");
  const list = defineDestination("list", { parent: products }, "list");
  const item = defineDestination(
    "item/$id",
    { parent: products, outlet: "detail", params: { id: numberParam } },
    "item",
  );
  const chat = defineDestination(
    "chat/$id",
    { outlet: "chat", params: { id: numberParam } },
    "chat",
  );
  const settings = defineDestination("settings", { parent: chat }, "settings");
  const own = createDestinationHandle(chat, undefined, router, view, base);
  const nested = createDestinationHandle(settings, chat, router, view, base);
  const shell = createDestinationHandle(list, products, router, view, base);
  const href = (tree) => serializer.serialize(tree);

  assert.equal(href(own.link({ close: true })), "/products/(list//detail:item/3)?sort=price");
  assert.equal(href(nested.link({ close: true })), "/products/(list//detail:item/3)?sort=price");
  assert.equal(
    href(shell.link({ to: item, close: true })),
    "/products/list(chat:chat/7)?sort=price",
  );
  assert.equal(
    href(own.link({ params: { id: 8 } })),
    "/products/(list//detail:item/3)(chat:chat/8)?sort=price",
  );
  assert.equal(
    href(shell.link({ search: { sort: "name" } })),
    "/products/(list//detail:item/3)(chat:chat/7)?sort=name",
  );
  assert.equal(
    href(nested.link({ to: "..", params: { id: 9 } })),
    "/products/(list//detail:item/3)(chat:chat/9)?sort=price",
  );

  // Closing what isn't open composes the current URL, and Angular decides.
  current = "/products/list?sort=price";
  assert.equal(href(own.link({ close: true })), current);
  assert.equal(await own.navigate({ close: true, onSameUrlNavigation: "reload" }), false);
  assert.deepEqual(navigations.at(-1), [current, { onSameUrlNavigation: "reload" }]);

  for (const [record, pattern] of [
    [{ close: true, params: { id: 1 } }, /^TypeError: close takes no URL values$/],
    [{ close: true, search: {} }, /^TypeError: close takes no URL values$/],
    [{ close: false }, /^TypeError: close must be true$/],
    [{ close: "yes" }, /^TypeError: close must be true$/],
  ]) {
    assert.throws(() => own.link(record), pattern);
  }

  assert.throws(
    () => shell.link({ close: true }),
    /^TypeError: close needs a destination in a named outlet: list$/,
  );
  assert.throws(
    () => own.link({ to: products, close: true }),
    /^TypeError: close needs a destination in a named outlet: products$/,
  );
  assert.throws(
    () => own.link({ close: true, replaceUrl: true }),
    /link takes no navigation behavior options/,
  );
  assert.throws(
    () => own.link({ params: { id: 1 }, fragment: "x" }),
    /^TypeError: A destination in outlet chat takes params only$/,
  );
});

test("handle writes reject a zero-segment group before navigating and take [] in a nonempty one", async () => {
  await import("@angular/compiler");

  const { createDestinationHandle } = await import("@loozo/angular-router/_generated");
  const { DefaultUrlSerializer } = await import("@angular/router");
  const serializer = new DefaultUrlSerializer();
  const calls = [];
  const router = {
    parseUrl: (url) => {
      calls.push(["parseUrl", url]);

      return serializer.parse(url);
    },
    navigateByUrl: (tree) => {
      calls.push(["navigateByUrl", serializer.serialize(tree)]);

      return Promise.resolve(true);
    },
  };
  const base = () => serializer.parse("/products/list?sort=price");
  const view = { params: null, search: null, data: null, title: null };
  const products = defineDestination("products", { search: { sort: stringParam } }, "products");
  const list = defineDestination("list", { parent: products }, "list");
  const chatRest = defineDestination(
    "$rest[]",
    { outlet: "chat", params: { rest: stringParam } },
    "chatRest",
  );
  const nestedRest = defineDestination(
    "$rest[]",
    { parent: products, outlet: "detail", params: { rest: stringParam } },
    "nestedRest",
  );
  const panel = defineDestination("panel", { parent: products, outlet: "detail" }, "panel");
  const panelRest = defineDestination(
    "$rest[]",
    { parent: panel, params: { rest: stringParam } },
    "panelRest",
  );
  const files = defineDestination(
    "files/$rest[]",
    { outlet: "chat", params: { rest: stringParam } },
    "files",
  );
  const shell = createDestinationHandle(list, products, router, view, base);
  const empty = { params: { rest: [] } };

  // Own and destination-targeted forms, link and navigate: a synchronous TypeError, and
  // Angular is never called.
  for (const [destination, up, pattern] of [
    [
      chatRest,
      undefined,
      /^TypeError: A destination in outlet chat needs at least one path segment: chatRest$/,
    ],
    [
      nestedRest,
      products,
      /^TypeError: A destination in outlet detail needs at least one path segment: nestedRest$/,
    ],
  ]) {
    const own = createDestinationHandle(destination, up, router, view, base);

    for (const [form, call] of [
      ["own link", () => own.link(empty)],
      ["own navigate", () => own.navigate(empty)],
      ["targeted link", () => shell.link({ to: destination, ...empty })],
      ["targeted navigate", () => shell.navigate({ to: destination, ...empty })],
    ]) {
      assert.throws(call, pattern, form);
    }
  }

  assert.deepEqual(calls, []);

  // An accumulated group that keeps a static segment takes [] on every form.
  for (const [destination, up, expected] of [
    [panelRest, panel, "/products/(list//detail:panel)?sort=price"],
    [files, undefined, "/products/list(chat:files)?sort=price"],
  ]) {
    const own = createDestinationHandle(destination, up, router, view, base);

    assert.equal(serializer.serialize(own.link(empty)), expected);
    assert.equal(serializer.serialize(shell.link({ to: destination, ...empty })), expected);

    calls.length = 0;
    assert.equal(await own.navigate(empty), true);
    assert.equal(await shell.navigate({ to: destination, ...empty }), true);
    assert.deepEqual(
      calls.filter(([kind]) => kind === "navigateByUrl"),
      [
        ["navigateByUrl", expected],
        ["navigateByUrl", expected],
      ],
    );
  }
});

test("the navigation base reads the browser URL before the first success, the router state after", async () => {
  await import("@angular/compiler");

  const { injectNavigationBase } = await import("@loozo/angular-router/_generated");
  const { Injector, PLATFORM_ID, runInInjectionContext, signal } = await import("@angular/core");
  const { Location } = await import("@angular/common");
  const { DefaultUrlSerializer, Router } = await import("@angular/router");
  const serializer = new DefaultUrlSerializer();
  const success = signal(null);
  const router = {
    lastSuccessfulNavigation: success,
    parseUrl: (url) => serializer.parse(url),
    serializeUrl: (tree) => serializer.serialize(tree),
    routerState: { snapshot: { url: "" } },
  };
  const location = {
    path: (fragment) =>
      fragment ? "/products/(list//detail:item/3)?a=1#f" : "/products/(list//detail:item/3)?a=1",
  };
  const make = (platform) =>
    runInInjectionContext(
      Injector.create({
        providers: [
          { provide: Router, useValue: router },
          { provide: Location, useValue: location },
          { provide: PLATFORM_ID, useValue: platform },
        ],
      }),
      injectNavigationBase,
    );
  const browser = make("browser");
  const server = make("server");

  assert.equal(serializer.serialize(browser()), "/products/(list//detail:item/3)?a=1#f");
  assert.equal(serializer.serialize(server()), "/");

  router.routerState.snapshot.url = "/plain(chat:chat/7)";
  success.set({ id: 1 });
  assert.equal(serializer.serialize(browser()), "/plain(chat:chat/7)");
  assert.equal(serializer.serialize(server()), "/plain(chat:chat/7)");

  // The function injects nothing; creating it needs an injection context.
  assert.throws(() => injectNavigationBase(), /NG0203/);
});

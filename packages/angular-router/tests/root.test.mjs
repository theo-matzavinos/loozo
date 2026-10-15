import assert from "node:assert/strict";
import { test } from "node:test";
import * as root from "@loozo/angular-router";

const {
  defineRoute,
  createUrl,
  stringParam,
  numberParam,
  booleanParam,
  enumParam,
  optionalSearchParam,
  nullableSearchParam,
} = root;

test("plain Node public namespace and concrete product consumer", () => {
  assert.deepEqual(Object.keys(root).sort(), [
    "booleanParam",
    "createUrl",
    "defineRoute",
    "enumParam",
    "nullableSearchParam",
    "numberParam",
    "optionalSearchParam",
    "stringParam",
  ]);

  const product = defineRoute("products/$productId", {
    params: { productId: numberParam },
    search: { tab: optionalSearchParam(enumParam(["details", "reviews"])) },
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
    search: { teamId: stringParam, z: optionalSearchParam(stringParam) },
    fragments: ["parent"],
  });
  const layout = defineRoute("", { parent: team });
  const child = defineRoute("$id/middle/$id", {
    parent: layout,
    params: { id: stringParam },
    search: { a: nullableSearchParam(booleanParam) },
    fragments: ["child"],
  });

  assert.equal(
    createUrl(child, {
      params: { teamId: 7, id: "λ/(1)" },
      search: { teamId: "query", z: "", a: null },
      fragment: "child",
    }),
    "/teams/7/%CE%BB%2F%281%29/middle/%CE%BB%2F%281%29?a=null&teamId=query&z=#child",
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

test("wrapper delegation retains exact promise, throw and rejection identities", async () => {
  const value = { label: "opaque" };
  const promise = Promise.resolve(value);
  const codec = { parse: () => promise, stringify: (input) => input.label };
  const wrappers = [
    optionalSearchParam(codec),
    nullableSearchParam(codec),
    optionalSearchParam(nullableSearchParam(codec)),
  ];

  for (const wrapper of wrappers) {
    assert.equal(wrapper.parse("ordinary"), promise);
    assert.equal(wrapper.stringify(value), "opaque");
  }

  assert.equal(nullableSearchParam(codec).parse("null"), null);
  assert.equal(nullableSearchParam(codec).stringify(null), "null");

  const failure = new Error("identity");
  const rejection = Promise.reject(failure);

  void rejection.catch(() => {});

  const rejecting = optionalSearchParam(
    nullableSearchParam({
      parse: () => rejection,
      stringify: () => {
        throw failure;
      },
    }),
  );

  assert.equal(rejecting.parse("x"), rejection);
  await assert.rejects(rejection, (error) => error === failure);
  assert.throws(
    () => rejecting.stringify("x"),
    (error) => error === failure,
  );

  const throwing = nullableSearchParam({
    parse: () => {
      throw failure;
    },
    stringify: String,
  });

  assert.throws(
    () => throwing.parse("x"),
    (error) => error === failure,
  );
  assert.throws(() => nullableSearchParam(optionalSearchParam(numberParam)), TypeError);

  for (const codec of wrappers) {
    assert.throws(() => defineRoute("$id", { params: { id: codec } }), TypeError);
  }
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
    search: { q: stringParam, opt: optionalSearchParam(stringParam) },
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
    { ...valid, search: {} },
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
    { ...redirect, search: { mode: "drop" } },
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

test("optional search fallback options are validated and URL creation may omit the key", () => {
  const page = optionalSearchParam(numberParam, { fallback: 1 });
  const list = defineRoute("items", {
    search: { page, sort: optionalSearchParam(stringParam), q: stringParam },
  });

  assert.equal(page.parse("2"), 2);
  assert.equal(page.stringify(3), "3");
  assert.throws(() => page.stringify(undefined), TypeError);
  assert.equal(createUrl(list, { search: { q: "x" } }), "/items?q=x");
  assert.equal(createUrl(list, { search: { q: "x", page: undefined } }), "/items?q=x");
  assert.equal(createUrl(list, { search: { q: "x", page: 2 } }), "/items?page=2&q=x");
  assert.throws(() => createUrl(list, { search: {} }), /Missing required search: q/);

  // Explicit undefined options mean no options; a fallback may itself be undefined or null.
  optionalSearchParam(numberParam, undefined);
  optionalSearchParam(numberParam, { fallback: undefined });
  optionalSearchParam(nullableSearchParam(numberParam), { fallback: null });

  for (const options of [
    null,
    1,
    [],
    {},
    { fallback: 1, extra: true },
    Object.create({ fallback: 1 }),
  ]) {
    assert.throws(() => optionalSearchParam(numberParam, options), TypeError);
  }

  assert.throws(() => nullableSearchParam(page), /Nullable cannot wrap optional/);
  assert.throws(() => defineRoute("$id", { params: { id: page } }), TypeError);

  // A fallback key is optional when writing: redirects may drop it or omit it on replace.
  const redirect = { to: list, search: { mode: "replace", values: { q: "x" } } };

  defineRoute("old", { redirect: { ...redirect, fragment: { mode: "drop" } } });
  defineRoute("older", {
    redirect: {
      to: defineRoute("paged", { search: { page } }),
      search: { mode: "drop" },
      fragment: { mode: "drop" },
    },
  });
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
    const route = defineRoute("optional", { search: { [key]: optionalSearchParam(stringParam) } });

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
    const optionalObject = defineRoute("object", { search: { [key]: optionalSearchParam(codec) } });

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
      search: { required: numberParam, [key]: optionalSearchParam(codec) },
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
    assert.throws(() => createUrl(mixed, { search: {} }), TypeError);
    assert.equal(calls.length, 1);
  }
});

test("required own undefined is a codec value, including inert redirect replacements", () => {
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
  const target = defineRoute("required", { search: { q: sentinel, box } });
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
  assert.equal(
    createUrl(target, { search: { q: undefined, box: opaque } }),
    "/required?box=boxed&q=sentinel",
  );
  assert.equal(stringifies, 2);
  assert.equal(parses, 0);
  assert.throws(() => createUrl(target, { search: { box: opaque } }), TypeError);
  assert.throws(
    () =>
      defineRoute("missing", {
        redirect: {
          to: target,
          search: { mode: "replace", values: { box: opaque } },
          fragment: { mode: "drop" },
        },
      }),
    TypeError,
  );
  assert.equal(stringifies, 2);
  assert.equal(parses, 0);
  assert.equal(
    createUrl(defineRoute("$id", { params: { id: sentinel } }), { params: { id: undefined } }),
    "/sentinel",
  );

  const optional = defineRoute("optional", { search: { q: optionalSearchParam(sentinel) } });

  assert.equal(createUrl(optional, {}), "/optional");
  assert.equal(createUrl(optional, { search: { q: undefined } }), "/optional");
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

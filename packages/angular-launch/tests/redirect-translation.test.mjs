import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEnvironmentInjector } from "@angular/core";
import {
  REDIRECT_TRANSLATOR,
  redirectTranslation,
  swap,
  targetSegments,
} from "../dist/redirect-translation.js";

const table = new Map([
  ["sign-in", "anmelden"],
  ["account", "konto"],
  ["help", "hilfe"],
  ["docs", "dokumente"],
  ["old", "alt"],
  ["(x)", "(y)"],
  ["ä", "ö"],
  ["products", "produkte"],
  ["item", "artikel"],
  ["chat", "plaudern"],
  ["detail", "einzeln"],
]);

// The segment texts targetSegments reads, for readable assertions.
function texts(to) {
  const segments = targetSegments(to);

  if (segments === undefined) {
    return undefined;
  }

  const result = [];

  for (const [start, end] of segments) {
    result.push(to.slice(start, end));
  }

  return result;
}

test("only the listed static positions change", () => {
  assert.equal(swap(table, "/sign-in", [0]), "/anmelden");
  // A parameter equal to a word isn't listed, so it stays.
  assert.equal(swap(table, "/account/sign-in/sign-in", [0, 2]), "/konto/sign-in/anmelden");
  // Catchall contents aren't listed either.
  assert.equal(swap(table, "/help/sign-in/x", [0]), "/hilfe/sign-in/x");
  // A parent-nested declaration's effective positions.
  assert.equal(swap(table, "/docs/old", [0, 1]), "/dokumente/alt");
});

test("search and fragment stay byte for byte, as do encoded parameter values", () => {
  assert.equal(
    swap(table, "/sign-in?next=%2Fsign-in&help=old#sign-in/old", [0]),
    "/anmelden?next=%2Fsign-in&help=old#sign-in/old",
  );
  assert.equal(swap(table, "/sign-in#help", [0]), "/anmelden#help");
  assert.equal(swap(table, "/account/a%2Fb%25c/sign-in", [0, 2]), "/konto/a%2Fb%25c/anmelden");
});

test("words are decoded from createUrl's encoding and re-encoded the same way", () => {
  assert.equal(swap(table, "/%28x%29", [0]), "/%28y%29");
  assert.equal(swap(table, "/%C3%A4", [0]), "/%C3%B6");
});

test("a word missing from the table, or one that doesn't decode, stays canonical", () => {
  assert.equal(swap(table, "/unknown/sign-in", [0, 1]), "/unknown/anmelden");
  assert.equal(swap(table, "/%E0%A4/sign-in", [0, 1]), "/%E0%A4/anmelden");
});

test("segments are counted over the paths createUrl writes, anchor first, never the outlet label", () => {
  assert.deepEqual(texts("/"), []);
  assert.deepEqual(texts("/?a=b/c#d"), []);
  assert.deepEqual(texts("/a/b%2Fc"), ["a", "b%2Fc"]);
  assert.deepEqual(texts("/(chat:chat/7)"), ["chat", "7"]);
  assert.deepEqual(texts("/products/(detail:item/3)"), ["products", "item", "3"]);
  assert.deepEqual(texts("/a/b/(o-1_x:c)?q=(o:d)#(e)"), ["a", "b", "c"]);
  // Encoded outlet syntax inside a value is data.
  assert.deepEqual(texts("/account/%28detail%3Aitem%29/sign-in"), [
    "account",
    "%28detail%3Aitem%29",
    "sign-in",
  ]);

  for (const to of [
    "",
    "a",
    "//a",
    "/a/",
    "/a//b",
    "/a(o:b)",
    "/a/(o:b)x",
    "/a/(o:b)/c",
    "/a/(o:b",
    "/a/(o:)",
    "/a/(:b)",
    "/a/(1o:b)",
    "/a/(o:b)(p:c)",
    "/(o:b//p:c)",
    "/a/(o:b/(p:c))",
    "/(o:b/c/)",
    "/a;m=1",
    "/a/(o:b;m=1)",
    "/(a)",
    "/a:b",
    "/ä",
    "/a%2",
    "/a%zz",
  ]) {
    assert.equal(targetSegments(to), undefined, to);
  }
});

test("in a named outlet, the anchor's and group's words change, never the label or values", () => {
  assert.equal(swap(table, "/products/(detail:item/3)", [0, 1]), "/produkte/(detail:artikel/3)");
  // The outlet name is no segment, even when it's spelled like a word.
  assert.equal(swap(table, "/(chat:chat/7)", [0]), "/(chat:plaudern/7)");
  assert.equal(swap(table, "/(detail:item/item)", [0]), "/(detail:artikel/item)");
  // A dynamic anchor's value and a catchall's elements aren't listed.
  assert.equal(
    swap(table, "/account/products/(detail:item/chat)", [0, 2]),
    "/konto/products/(detail:artikel/chat)",
  );
  assert.equal(
    swap(table, "/products/(detail:item/item/products/chat)", [0, 1]),
    "/produkte/(detail:artikel/item/products/chat)",
  );
  // Encoded values and suffix bytes stay.
  assert.equal(
    swap(table, "/products/(detail:item/a%2Fb%3A%28c%29%25%26%40%24%2C%C3%A4)?x=(y:z)", [0, 1]),
    "/produkte/(detail:artikel/a%2Fb%3A%28c%29%25%26%40%24%2C%C3%A4)?x=(y:z)",
  );
});

test("a path createUrl doesn't write isn't swapped", () => {
  assert.throws(() => swap(table, "/a(o:b)", [0]), /Not a createUrl path: \/a\(o:b\)/);
});

test("the provider builds its table once, the first time a redirect needs it", () => {
  let calls = 0;
  const parent = createEnvironmentInjector([]);
  const injector = createEnvironmentInjector(
    [
      redirectTranslation(() => {
        calls += 1;

        return { words: ["sign-in", "todos"], translations: ["anmelden", "aufgaben"] };
      }),
    ],
    parent,
  );
  const translate = injector.get(REDIRECT_TRANSLATOR);

  assert.equal(calls, 0);
  assert.equal(translate("/sign-in", [0]), "/anmelden");
  assert.equal(translate("/todos", [0]), "/aufgaben");
  assert.equal(calls, 1);
  injector.destroy();
  parent.destroy();
});

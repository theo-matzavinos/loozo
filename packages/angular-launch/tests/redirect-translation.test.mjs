import "@angular/compiler";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEnvironmentInjector } from "@angular/core";
import { REDIRECT_TRANSLATOR, redirectTranslation, swap } from "../dist/redirect-translation.js";

const table = new Map([
  ["sign-in", "anmelden"],
  ["account", "konto"],
  ["help", "hilfe"],
  ["docs", "dokumente"],
  ["old", "alt"],
  ["(x)", "(y)"],
  ["ä", "ö"],
]);

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
  assert.equal(swap(table, "/%E0%A4%A/sign-in", [0, 1]), "/%E0%A4%A/anmelden");
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

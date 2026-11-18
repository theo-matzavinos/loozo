import assert from "node:assert/strict";
import { test } from "node:test";
import { clearTranslations, loadTranslations, ɵ$localize as angular } from "@angular/localize";
import { segmentMessage } from "@loozo/angular-router/_generation";
import { swap } from "../dist/redirect-translation.js";

// Each import is a fresh module instance, so each case installs into the globalThis it sets up.
let instance = 0;

async function install(existing) {
  if (existing === undefined) {
    delete globalThis.$localize;
  } else {
    globalThis.$localize = existing;
  }

  instance += 1;
  await import(`../dist/source-text.js?case=${instance}`);

  return globalThis.$localize;
}

// Evaluates one tagged template with `tag` as its `$localize`.
function evaluate(tag, template, values = {}) {
  return new Function("$localize", ...Object.keys(values), `return ${template};`)(
    tag,
    ...Object.values(values),
  );
}

test("the installed tag gives Angular's own output for every router segment message", async () => {
  const tag = await install(undefined);

  for (const word of [
    "sign-in",
    "anmelden",
    "ä",
    "(x)",
    "a:b",
    "back`tick",
    "back\\slash",
    "dollar${brace}",
    "dollar$",
    "line\nbreak",
    " ",
  ]) {
    const message = segmentMessage(word);

    assert.equal(evaluate(tag, message), word, message);
    assert.equal(evaluate(tag, message), evaluate(angular, message), message);
  }
});

test("expressions, escaped colons and plain templates join as Angular's tag joins them", async () => {
  const tag = await install(undefined);
  const values = { name: "Ada", count: 3, date: new Date(0) };

  for (const template of [
    "$localize`plain`",
    "$localize`:meaning|description@@id:Hello ${name}:INTERPOLATION:, ${count}:COUNT: new`",
    "$localize`:@@id:\\:starts with a colon`",
    "$localize`:a\\:b@@id:escaped colon in the block`",
    "$localize`${name}${count}`",
    "$localize`${date}`",
    "$localize``",
  ]) {
    assert.equal(evaluate(tag, template, values), evaluate(angular, template, values), template);
  }

  assert.throws(() => evaluate(tag, "$localize`:unterminated`"), /Unterminated \$localize/);
});

test("a translate hook applies first, as loadTranslations attaches it", async () => {
  const tag = await install(undefined);
  const hook = (parts, expressions) => {
    const translated = Object.assign(["Hallo ", ""], { raw: ["Hallo ", ""] });

    return [translated, [expressions[0]]];
  };

  tag.translate = hook;
  angular.translate = hook;

  try {
    const template = "$localize`:@@greeting:Hello ${name}`";

    assert.equal(evaluate(tag, template, { name: "Ada" }), "Hallo Ada");
    assert.equal(
      evaluate(tag, template, { name: "Ada" }),
      evaluate(angular, template, { name: "Ada" }),
    );
  } finally {
    delete angular.translate;
  }
});

test("an existing tag is kept, and an existing { locale } object is replaced keeping its locale", async () => {
  const existing = () => "existing";

  assert.equal(await install(existing), existing);

  const tag = await install({ locale: "de" });

  assert.equal(typeof tag, "function");
  assert.equal(tag.locale, "de");
  assert.equal(evaluate(tag, segmentMessage("sign-in")), "sign-in");

  assert.equal((await install({})).locale, undefined);
});

// Unsupported, documented: a host whose existing $localize translates. The installer keeps it,
// so the server writes translated words at the listed positions, and the German table, which
// maps canonical words, translates them again.
test("a runtime-translating host tag is kept, and its redirects are translated twice", async () => {
  globalThis.$localize = angular;

  try {
    loadTranslations({ "route.segment.sign-in": "anmelden" });

    const tag = await install(angular);

    assert.equal(tag, angular);

    const to = `/${evaluate(tag, segmentMessage("sign-in"))}`;
    const german = new Map([
      ["sign-in", "anmelden"],
      ["anmelden", "empfangen"],
    ]);

    assert.equal(to, "/anmelden");
    // A translated word equal to another canonical word reaches that route's German path.
    assert.equal(swap(german, to, [0]), "/empfangen");
    // A translated word the table doesn't know stays, and the German build can't match it.
    assert.equal(swap(new Map([["sign-in", "anmelden"]]), "/einloggen", [0]), "/einloggen");
  } finally {
    clearTranslations();
  }
});

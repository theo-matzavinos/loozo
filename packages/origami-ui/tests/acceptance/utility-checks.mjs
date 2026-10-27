import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// I1/I2 in Node: the installed public utilities through the consumer's own Angular Core.
const consumer = createRequire(resolve(".scratch/consumer/package.json"));

async function load(specifier) {
  return import(pathToFileURL(consumer.resolve(specifier)).href);
}

await load("@angular/compiler");

const { Injector, InjectionToken, runInInjectionContext } = await load("@angular/core");
const {
  injectDeferred,
  injectUniqueId,
  injectUniqueValue,
  ɵcanonicalDay,
  ɵformatDay,
  ɵparseDay,
  ɵutcDate,
} = await load("@loozo/origami-ui/utils");
const token = new InjectionToken("public utility check");
let lookups = 0;
const outer = Injector.create({
  providers: [
    {
      provide: token,
      useFactory: () => {
        lookups += 1;

        return "outer";
      },
    },
  ],
});
const nested = Injector.create({
  providers: [{ provide: token, useValue: "nested" }],
  parent: outer,
});

try {
  assert.throws(() => injectDeferred(token), /NG0203|injection context/);
  assert.throws(() => injectUniqueId("outside"), /NG0203|injection context/);
  assert.throws(() => injectUniqueValue("outside"), /NG0203|injection context/);

  // Keys are lowercase kebab-case; anything else fails before allocating.
  for (const key of ["", "Upper", "1st", "-lead", "snake_case", "\ud800", "�", 7]) {
    assert.throws(() => runInInjectionContext(outer, () => injectUniqueId(key)), TypeError);
    assert.throws(() => runInInjectionContext(outer, () => injectUniqueValue(key)), TypeError);
  }

  const resolveOuter = runInInjectionContext(outer, () => injectDeferred(token));
  const resolveNested = runInInjectionContext(nested, () => injectDeferred(token));

  assert.equal(lookups, 0, "Capture must not resolve the token");
  assert.equal(resolveNested(), "nested");
  assert.equal(resolveOuter(), "outer");
  assert.equal(resolveOuter(), "outer");
  assert.equal(lookups, 1, "The capturing injector resolves once and caches");
} finally {
  nested.destroy();
  outer.destroy();
}

// The package-private civil date that Calendar and the date field share: only canonical days in
// 0001–9999 are values, and labels name the ISO day whatever the platform's time zone.
{
  assert.deepEqual(ɵparseDay("2026-10-27"), { year: 2026, month: 10, day: 27 });
  assert.deepEqual(ɵparseDay("2024-02-29"), { year: 2024, month: 2, day: 29 }, "Leap day");
  assert.deepEqual(ɵparseDay("2000-02-29"), { year: 2000, month: 2, day: 29 }, "400-year leap");
  assert.deepEqual(ɵparseDay("0001-01-01"), { year: 1, month: 1, day: 1 });
  assert.deepEqual(ɵparseDay("9999-12-31"), { year: 9999, month: 12, day: 31 });

  for (const text of [
    "2026-02-31",
    "2023-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "27/10/2026",
    "2026-1-07",
    "2026-10-7",
    " 2026-10-27",
    "2026-10-27T00:00",
    "0000-01-01",
    "10000-01-01",
    "+02026-10-27",
    "",
    null,
    undefined,
    20261027,
  ]) {
    assert.equal(ɵparseDay(text), null, `${JSON.stringify(text)} is no day`);
    assert.equal(ɵcanonicalDay(text), null);
  }

  assert.equal(ɵcanonicalDay("2026-10-27"), "2026-10-27");
  assert.equal(ɵformatDay({ year: 1, month: 2, day: 3 }), "0001-02-03");
  assert.equal(ɵutcDate("0001-01-01").getUTCFullYear(), 1, "Years below 100 kept");

  const zone = process.env.TZ;

  try {
    for (const timeZone of [
      "Pacific/Kiritimati",
      "Pacific/Pago_Pago",
      "America/Sao_Paulo",
      "UTC",
    ]) {
      process.env.TZ = timeZone;
      assert.equal(ɵutcDate("2018-11-04").toISOString(), "2018-11-04T00:00:00.000Z", timeZone);
    }
  } finally {
    if (zone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = zone;
    }
  }
}

console.log(
  "I1 I2: installed utilities reject outside context and invalid keys, resolve nearest lazily and cache per injector; the civil date accepts only canonical days and labels them in UTC.",
);

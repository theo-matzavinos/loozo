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
const { injectDeferred, injectUniqueId } = await load("@loozo/origami-ui/utils");
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

console.log(
  "I1 I2: installed utilities reject outside context, resolve nearest lazily and cache per injector.",
);

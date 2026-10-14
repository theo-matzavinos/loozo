import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { performCompilation, readConfiguration } from "@angular/compiler-cli";

// Real AOT compilation of SSR-only consumer fixtures, then official renderApplication through
// the consumer's own installed Angular and package. No browser globals, DOM shim or forced
// change detection: every render is driven only by Angular and PendingTasks.
const sourceRoot = path.resolve(".scratch/consumer/src");
const outDir = path.resolve(".scratch/consumer/.runtime/acceptance-ssr");
const fixtures = ["server-order", "server-errors", "server-identity"];
const configuration = readConfiguration(path.resolve(".scratch/consumer/tsconfig.app.json"));

await rm(outDir, { recursive: true, force: true });

const rootNames = [];

for (const name of fixtures) {
  rootNames.push(path.join(sourceRoot, "fixtures", `${name}.ts`));
}

const compiled = performCompilation({
  rootNames,
  options: {
    ...configuration.options,
    noEmit: false,
    declaration: false,
    sourceMap: false,
    outDir,
    rootDir: sourceRoot,
    compilationMode: "full",
  },
});
const compileErrors = [];

for (const diagnostic of compiled.diagnostics) {
  if (diagnostic.category === ts.DiagnosticCategory.Error) {
    compileErrors.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  }
}

assert.deepEqual(compileErrors, [], "SSR fixtures must compile with strict AOT templates");

// Emitted modules resolve Angular and the package from .scratch/consumer/node_modules; load the
// same consumer copies here instead of the root tool installation.
const consumer = createRequire(path.resolve(".scratch/consumer/package.json"));
const emitted = createRequire(path.join(outDir, "fixtures", "server-order.js"));

for (const specifier of ["@angular/core", "@loozo/origami-ui/accordion"]) {
  assert.equal(
    emitted.resolve(specifier),
    consumer.resolve(specifier),
    `${specifier} must resolve to the consumer installation from emitted fixtures`,
  );
}

async function load(specifier) {
  return import(pathToFileURL(consumer.resolve(specifier)).href);
}

async function fixture(name) {
  return import(pathToFileURL(path.join(outDir, "fixtures", `${name}.js`)).href);
}

await load("@angular/compiler");

const { ErrorHandler } = await load("@angular/core");
const { bootstrapApplication } = await load("@angular/platform-browser");
const { renderApplication, provideServerRendering, BEFORE_APP_SERIALIZED } = await load(
  "@angular/platform-server",
);

async function render(component, selector, providers) {
  const errors = [];
  const html = await renderApplication(
    (context) =>
      bootstrapApplication(
        component,
        {
          providers: [
            provideServerRendering(),
            { provide: ErrorHandler, useValue: { handleError: (error) => errors.push(error) } },
            ...providers,
          ],
        },
        context,
      ),
    {
      document: `<${selector}></${selector}>`,
      url: "http://localhost/",
      allowedHosts: ["localhost"],
    },
  );

  return { html, errors };
}

function serverItemValues(nodes) {
  const values = [];

  for (const node of nodes) {
    values.push(
      node.getAttribute("data-server-item") ?? node.getAttribute("data-server-accordion-item"),
    );
  }

  return values;
}

// C2 A3 L2: construction failures surface from a genuine server render.
const errors = await fixture("server-errors");

for (const [name, expected] of [
  ["OrphanCollection", /NG0201: No provider found/],
  ["OrphanAccordion", /NG0201: No provider found/],
  ["OrphanAccordionPanel", /NG0201: No provider found/],
  ["DuplicateTrigger", /only one mounted trigger/],
  ["DuplicatePanel", /only one mounted panel/],
]) {
  const handled = [];

  await assert.rejects(
    () =>
      renderApplication(
        (context) =>
          bootstrapApplication(
            errors[name],
            {
              providers: [
                {
                  provide: ErrorHandler,
                  useValue: { handleError: (error) => handled.push(error) },
                },
              ],
            },
            context,
          ),
        {
          document: "<error-app></error-app>",
          url: "http://localhost/",
          allowedHosts: ["localhost"],
        },
      ),
    expected,
    `${name} must fail clearly during SSR`,
  );

  for (const error of handled) {
    assert.match(String(error), expected, `${name} reported an unrelated error`);
  }
}

console.log("C2 A3 L2: five SSR construction failures rejected clearly.");

// C3 A5: an async PendingTasks key move after the first public State read retains all nodes,
// parents and Collection records, and serializes the final public order.
const { ServerOrderConsumer, ServerOrderEvidence, ServerOnPushOrderConsumer } =
  await fixture("server-order");
const evidence = new ServerOrderEvidence();
const ordered = await render(ServerOrderConsumer, "order-app", [
  { provide: BEFORE_APP_SERIALIZED, multi: true, useValue: () => evidence.observeFinal() },
  { provide: ServerOrderEvidence, useValue: evidence },
]);

assert.deepEqual(ordered.errors, []);
assert.deepEqual(evidence.initialValues, ["one", "two"]);
assert.equal(evidence.initialNodes.length, 4);
assert.equal(evidence.retained, true, "Nodes, parents and Collection records are retained");
assert.deepEqual(evidence.finalValues, ["two", "one"]);
assert.deepEqual(evidence.finalCollectionValues, ["two", "one"]);
assert.deepEqual(serverItemValues(evidence.finalNodes), ["two", "one", "two", "one"]);
assert.ok(evidence.observations >= 2 && evidence.observations < 20, "No stabilization loop");
assert.match(ordered.html, /id="server-collection-order"[^>]*>two,one<\/output>/);
assert.match(ordered.html, /id="server-accordion-order"[^>]*>two,one<\/output>/);
console.log(
  `C3 A5: pending-task SSR key move retained four nodes/records and serialized two,one (${evidence.observations} observations).`,
);

// The static OnPush owner is checked once; only dirty descendants reorder. Three consecutive
// public reads before serialization must already be current.
const onPush = new ServerOrderEvidence();
const onPushRender = await render(ServerOnPushOrderConsumer, "onpush-order-app", [
  { provide: BEFORE_APP_SERIALIZED, multi: true, useValue: () => onPush.observeFinal() },
  { provide: ServerOrderEvidence, useValue: onPush },
]);
const onPushDom = serverItemValues(onPush.finalNodes);

assert.deepEqual(onPushRender.errors, []);
assert.equal(onPush.ownerChecks, 1, "No owner refresh may mask descendant-only ordering");
assert.deepEqual(onPush.initialValues, ["one", "two"]);
assert.equal(onPush.initialNodes.length, 4);
assert.equal(onPush.retained, true);
assert.deepEqual(onPushDom, ["two", "one", "two", "one"]);
assert.equal(onPush.finalReads.length, 3);

for (const read of onPush.finalReads) {
  assert.deepEqual(read.collection, onPushDom.slice(0, 2));
  assert.deepEqual(read.accordion, onPushDom.slice(2));
}

assert.equal(onPush.observations, 2);
assert.match(onPushRender.html, /id="onpush-collection-order"[^>]*>two,one<\/output>/);
assert.match(onPushRender.html, /id="onpush-accordion-order"[^>]*>two,one<\/output>/);
console.log(
  "C3 A5: OnPush owner checked once; descendant-only reorder, three current public reads, serialized two,one.",
);

// I3: unhosted allocations are valid and application-unique; hosted allocations correspond
// across independent renders (no process-global leakage). No unhosted SSR matching is claimed.
const { ServerIdentityConsumer, ServerIdentityEvidence } = await fixture("server-identity");
const renders = [];

for (let index = 0; index < 2; index += 1) {
  const identity = new ServerIdentityEvidence();
  const result = await render(ServerIdentityConsumer, "server-identity-app", [
    { provide: ServerIdentityEvidence, useValue: identity },
  ]);

  assert.deepEqual(result.errors, []);
  assert.equal(identity.unhosted.length, 5);
  assert.equal(new Set(identity.unhosted).size, 5, "Unhosted allocations are unique");
  assert.equal(identity.hosted.length, 8);
  assert.equal(new Set(identity.hosted).size, 8, "Repeated and odd keys never collide");

  for (const value of [...identity.unhosted, ...identity.hosted]) {
    assert.equal(typeof value, "string");
    assert.notEqual(value, "");
  }

  assert.match(result.html, /data-hosted-identity="[^"]+"/);
  renders.push(identity);
}

assert.deepEqual(
  renders[1].hosted,
  renders[0].hosted,
  "Independent renders allocate corresponding hosted identities",
);
console.log(
  "I3: five unique unhosted SSR allocations; eight distinct hosted allocations correspond across independent renders.",
);

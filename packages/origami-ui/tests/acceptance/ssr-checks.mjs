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
const fixtures = ["server-order", "server-errors", "server-identity", "server-roving"];
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

// C2 A3 K9: construction failures surface from a genuine server render, including a Toolbar
// group outside a Toolbar.
const errors = await fixture("server-errors");

for (const [name, expected] of [
  ["OrphanCollection", /NG0201: No provider found/],
  ["OrphanAccordion", /NG0201: No provider found/],
  ["OrphanAccordionPanel", /NG0201: No provider found/],
  ["OrphanToolbarToggleGroupSingle", /NG0201: No provider found for `ToolbarContext`/],
  ["OrphanToolbarToggleGroupMultiple", /NG0201: No provider found for `ToolbarContext`/],
  ["OrphanToolbarRadioGroup", /NG0201: No provider found for `ToolbarContext`/],
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

console.log("C2 A3 K9: six SSR construction failures rejected clearly.");

// L2: a second mounted part throws when it publishes in ngOnInit, during change detection, so
// Angular reports it once through the application's ErrorHandler.
for (const [name, expected] of [
  ["DuplicateTrigger", /only one mounted trigger/],
  ["DuplicatePanel", /only one mounted panel/],
]) {
  const duplicate = await render(errors[name], "error-app", []);

  assert.equal(duplicate.errors.length, 1, `${name} must report exactly one error`);
  assert.match(String(duplicate.errors[0]), expected, `${name} must fail clearly during SSR`);
}

console.log("L2: two duplicate SSR parts reported clearly at publish.");

// C3 A5: an async PendingTasks keyed move after the first public State read retains all nodes,
// parents and Collection records. Membership is unchanged, so no reader is notified: `items`
// stays the same array and the serialized public order is the order before the move.
const {
  ServerOrderConsumer,
  ServerOrderEvidence,
  ServerLateOrderConsumer,
  ServerLateOrderEvidence,
} = await fixture("server-order");
const evidence = new ServerOrderEvidence();
const ordered = await render(ServerOrderConsumer, "order-app", [
  { provide: BEFORE_APP_SERIALIZED, multi: true, useValue: () => evidence.observeFinal() },
  { provide: ServerOrderEvidence, useValue: evidence },
]);

assert.deepEqual(ordered.errors, []);
assert.deepEqual(evidence.initialValues, ["one", "two"]);
assert.equal(evidence.initialNodes.length, 4);
assert.equal(evidence.retained, true, "Nodes, parents and Collection records are retained");
assert.deepEqual(serverItemValues(evidence.finalNodes), ["two", "one", "two", "one"]);
assert.equal(evidence.sameItems, true, "A keyed move notifies no items reader");
assert.deepEqual(evidence.finalCollectionValues, ["one", "two"]);
assert.deepEqual(evidence.finalValues, ["one", "two"]);
assert.ok(evidence.observations >= 2 && evidence.observations < 20, "No stabilization loop");
assert.match(ordered.html, /id="server-collection-order"[^>]*>one,two<\/output>/);
assert.match(ordered.html, /id="server-accordion-order"[^>]*>one,two<\/output>/);
console.log(
  `C3 A5: pending-task SSR keyed move retained four nodes/records and notified no reader (${evidence.observations} observations).`,
);

// C3 A5: order first read after unread moves and an insertion is current DOM order; a further
// keyed move keeps it, and a later removal reads current DOM order again before serialization.
const late = new ServerLateOrderEvidence();
const lateRender = await render(ServerLateOrderConsumer, "late-order-app", [
  { provide: BEFORE_APP_SERIALIZED, multi: true, useValue: () => late.observeFinal() },
  { provide: ServerLateOrderEvidence, useValue: late },
]);

assert.deepEqual(lateRender.errors, []);
assert.deepEqual(late.firstCollection, ["three", "two", "one"]);
assert.deepEqual(late.firstAccordion, ["three", "two", "one"]);
assert.deepEqual(late.movedCollection, ["three", "two", "one"]);
assert.deepEqual(late.movedAccordion, ["three", "two", "one"]);
assert.deepEqual(serverItemValues(late.finalNodes), ["one", "two", "one", "two"]);
assert.deepEqual(late.finalCollection, ["one", "two"]);
assert.deepEqual(late.finalAccordion, ["one", "two"]);
console.log(
  "C3 A5: first reads after unread moves and insertion returned three,two,one; a keyed move kept it; a removal read one,two.",
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
  assert.equal(identity.hosted.length, 6);
  assert.equal(new Set(identity.hosted).size, 6, "Repeated keys never collide");

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
  "I3: five unique unhosted SSR allocations; six distinct hosted allocations correspond across independent renders.",
);

/** The attributes of the element whose `data-testid` is `testid`, from serialized HTML. */
function attributesOf(html, testid) {
  const tag = html.match(new RegExp(`<[a-z]+\\b[^>]*data-testid="${testid}"[^>]*>`))?.[0];

  assert.ok(tag, `${testid} is rendered`);

  const attributes = new Map();

  for (const match of tag.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
    attributes.set(match[1], match[2] ?? "");
  }

  return attributes;
}

// S8 U7 K8 Q7: repeated roving items with required replacement inputs render in development
// mode, where Angular checks for NG0100, without NG0950; the third item is each widget's only
// tab stop. S9 L5 V15: associations to parts rendered later (a later `@for`, a later sibling
// component) are complete in server HTML.
const { ServerRovingConsumer } = await fixture("server-roving");
const roving = await render(ServerRovingConsumer, "roving-app", []);

assert.deepEqual(roving.errors, []);

for (const widget of ["tab", "mark", "tool", "radio"]) {
  const stops = [];

  for (const key of ["one", "two", "three"]) {
    if (attributesOf(roving.html, `repeated-${widget}-${key}`).get("tabindex") === "0") {
      stops.push(key);
    }
  }

  assert.deepEqual(stops, ["three"], `${widget}: one server tab stop, on the third item`);
}

for (const key of ["one", "two", "three"]) {
  const trigger = attributesOf(roving.html, `repeated-tab-${key}`);
  const panel = attributesOf(roving.html, `repeated-panel-${key}`);

  assert.equal(trigger.get("aria-controls"), `ssr-repeated-panel-${key}`);
  assert.equal(panel.get("id"), `ssr-repeated-panel-${key}`);
  assert.equal(panel.get("aria-labelledby"), trigger.get("id"));
}

const splitTrigger = attributesOf(roving.html, "split-collapsible-trigger");
const splitPanel = attributesOf(roving.html, "split-collapsible-panel");

assert.equal(splitTrigger.get("id"), "ssr-split-trigger");
assert.equal(splitTrigger.get("aria-controls"), "ssr-split-panel");
assert.equal(splitPanel.get("aria-labelledby"), "ssr-split-trigger");
assert.equal(
  attributesOf(roving.html, "split-popover-trigger").get("aria-controls"),
  "ssr-split-content",
);
console.log(
  "S8 U7 K8 Q7: repeated required-input items rendered one server tab stop per widget, on the third; S9 L5 V15: later parts' associations are complete in server HTML.",
);

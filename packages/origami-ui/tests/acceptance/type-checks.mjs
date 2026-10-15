import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { performCompilation } from "@angular/compiler-cli";

const directory = path.resolve(".scratch/consumer/.runtime/acceptance-types");

await mkdir(directory, { recursive: true });

const filename = path.join(directory, "public-types.ts");

await copyFile("acceptance/types.ts", filename);

const original = await readFile(filename, "utf8");
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.Preserve,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  experimentalDecorators: true,
  types: [],
};

function diagnostics(file) {
  const program = ts.createProgram([file], options);

  return ts
    .getPreEmitDiagnostics(program)
    .filter((item) => item.category === ts.DiagnosticCategory.Error);
}

function format(errors) {
  return ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  });
}

// The marked file must compile cleanly: an unused `@ts-expect-error` is itself an error (2578).
// One more compilation with every marker unsuppressed then attributes each real error to the
// statement after its marker. Missing packages and broken surrounding code cannot pass.
async function verifyExpectedErrors(file, source) {
  const baseline = diagnostics(file);

  assert.equal(baseline.length, 0, format(baseline));

  const lines = source.split("\n");
  const markers = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes("@ts-expect-error")) {
      markers.set(index + 1, []);
    }
  }

  await writeFile(file, source.replaceAll("@ts-expect-error", "negative assertion"));

  const errors = diagnostics(file);

  await writeFile(file, source);

  for (const error of errors) {
    assert.ok(error.file && typeof error.start === "number", format([error]));
    assert.equal(error.file.fileName, file);

    const location = error.file.getLineAndCharacterOfPosition(error.start);
    const diagnosed = markers.get(location.line);

    assert.ok(
      diagnosed,
      `Error outside a marked statement at line ${location.line + 1}: ${format([error])}`,
    );
    assert.notEqual(error.code, 2307, "A missing package is not negative type proof");
    diagnosed.push({
      code: error.code,
      message: ts.flattenDiagnosticMessageText(error.messageText, "\n"),
      span: error.file.text.slice(error.start, error.start + error.length),
      column: location.character + 1,
    });
  }

  const evidence = [];

  for (const [statementLine, found] of markers) {
    assert.ok(found.length > 0, `Marker at line ${statementLine} suppresses no error of its own`);
    evidence.push({
      file,
      line: statementLine,
      assertion: lines[statementLine - 1].trim(),
      diagnostics: found,
    });
  }

  return evidence;
}

const negativeEvidence = await verifyExpectedErrors(filename, original);
const providerFile = path.join(directory, "provider-types.ts");
const providerSource = `
import { computed, signal, type Provider, type Signal, type WritableSignal } from '@angular/core';
import { injectDeferred } from '@loozo/origami-ui/utils';
import { OrigamiPresenceOptions } from '@loozo/origami-ui/presence';
import { OrigamiCollectionItemOptions } from '@loozo/origami-ui/collection';
import { OrigamiCollapsibleOptions, OrigamiCollapsibleTriggerOptions, OrigamiCollapsiblePanelOptions, type OrigamiCollapsibleHiding } from '@loozo/origami-ui/collapsible';
import { OrigamiAccordionOptions, OrigamiAccordionSingleOptions, OrigamiAccordionMultipleOptions, OrigamiAccordionTriggerOptions, OrigamiAccordionPanelOptions } from '@loozo/origami-ui/accordion';
import { OrigamiPopoverOptions, OrigamiPopoverTriggerOptions, OrigamiPopoverAnchorOptions, OrigamiPopoverContentOptions, type OrigamiPopoverContentState } from '@loozo/origami-ui/popover';
declare const contentState: OrigamiPopoverContentState;
// @ts-expect-error Content State has no public Presence phase alias
void contentState.phase;
// Positive: Presence requires only readonly observation, not writable capability.
OrigamiPresenceOptions.provideFactory(() => ({present: computed(() => false)}));
// @ts-expect-error Presence observation must be boolean
OrigamiPresenceOptions.provideFactory(() => ({present: signal('wrong')}));
// @ts-expect-error collection value must be a string signal
OrigamiCollectionItemOptions.provideFactory(() => ({value: signal(1)}));
// @ts-expect-error Collapsible expanded must be writable
OrigamiCollapsibleOptions.provideFactory(() => ({expanded: computed(() => false), disabled: signal(false), hiding: signal('hidden' as const)}));
// @ts-expect-error Trigger requires a typed string id
OrigamiCollapsibleTriggerOptions.provideFactory(() => ({id: signal(1)}));
// Positive: Panel Options are id-only; domain roles remain consumer markup.
OrigamiCollapsiblePanelOptions.provideFactory(() => ({id: signal('valid-id-only')}));
// @ts-expect-error Panel id must be a string signal
OrigamiCollapsiblePanelOptions.provideFactory(() => ({id: signal(1)}));
// @ts-expect-error shared Accordion requires a boolean disabled signal
OrigamiAccordionOptions.provideFactory(() => ({disabled: signal('wrong')}));
// @ts-expect-error Single root value cannot be an array
OrigamiAccordionSingleOptions.provideFactory(() => ({value: signal<readonly string[]>([]), disabled: signal(false), collapsible: signal(true)}));
// @ts-expect-error Multiple root value cannot be a string
OrigamiAccordionMultipleOptions.provideFactory(() => ({value: signal('one'), disabled: signal(false)}));
// @ts-expect-error Accordion Trigger id remains a typed signal
OrigamiAccordionTriggerOptions.provideFactory(() => ({id: signal(1)}));
// Positive: Accordion Panel also has id-only Options.
OrigamiAccordionPanelOptions.provideFactory(() => ({id: signal('valid-id-only')}));
// @ts-expect-error Accordion Panel id must be a string signal
OrigamiAccordionPanelOptions.provideFactory(() => ({id: signal(1)}));
// @ts-expect-error Popover writable open cannot be a readonly computation
OrigamiPopoverOptions.provideFactory(() => ({open: computed(() => false), disabled: signal(false), dismissible: signal(true)}));
// @ts-expect-error Popover Trigger id remains a typed signal
OrigamiPopoverTriggerOptions.provideFactory(() => ({id: signal(1)}));
// @ts-expect-error Anchor id remains a typed signal
OrigamiPopoverAnchorOptions.provideFactory(() => ({id: signal(1)}));
// @ts-expect-error Content requires the complete four-field signal shape
OrigamiPopoverContentOptions.provideFactory(() => ({id: signal('only-id')}));
class WrongExistingTrigger { readonly id = signal(1); }
// @ts-expect-error provideExisting checks the compatible forward-referenced class
OrigamiPopoverTriggerOptions.provideExisting(() => WrongExistingTrigger);
// @ts-expect-error a Collapsible factory must supply every root field
OrigamiCollapsibleOptions.provideFactory(() => ({expanded: signal(true)}));
// @ts-expect-error missing Trigger identity cannot be repaired by lower defaults
OrigamiCollapsibleTriggerOptions.provideFactory(() => ({}));
// @ts-expect-error missing Panel identity cannot be repaired by lower defaults
OrigamiCollapsiblePanelOptions.provideFactory(() => ({}));
// @ts-expect-error a Single factory must supply collapsible
OrigamiAccordionSingleOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false)}));
// @ts-expect-error Popover open must be a boolean signal
OrigamiPopoverOptions.provideFactory(() => ({open: signal('wrong'), disabled: signal(false), dismissible: signal(true)}));
class WrongPresent { readonly present = signal(1); }
class WrongRoot { readonly expanded = signal(1); readonly disabled = signal(false); readonly hiding = signal<OrigamiCollapsibleHiding>('hidden'); }
class WrongIdentity { readonly id = signal(7); }
// @ts-expect-error incompatible existing Presence class
OrigamiPresenceOptions.provideExisting(() => WrongPresent);
// @ts-expect-error incompatible existing Collapsible root class
OrigamiCollapsibleOptions.provideExisting(() => WrongRoot);
// @ts-expect-error incompatible existing Collapsible Trigger class
OrigamiCollapsibleTriggerOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Collapsible Panel class
OrigamiCollapsiblePanelOptions.provideExisting(() => WrongIdentity);
// Positive: complete factories and abstract existing classes return ordinary Provider arrays.
abstract class AbstractCollapsible {
  abstract readonly expanded: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly hiding: Signal<OrigamiCollapsibleHiding>;
}
abstract class AbstractCollectionItem {
  abstract readonly value: Signal<string>;
}
abstract class AbstractAccordion {
  abstract readonly disabled: Signal<boolean>;
}
abstract class AbstractAccordionSingle {
  abstract readonly value: WritableSignal<string | null>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly collapsible: Signal<boolean>;
}
abstract class AbstractAccordionMultiple {
  abstract readonly value: WritableSignal<readonly string[]>;
  abstract readonly disabled: Signal<boolean>;
}
abstract class AbstractIdentity {
  abstract readonly id: Signal<string>;
}
abstract class AbstractPopover {
  abstract readonly open: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly dismissible: Signal<boolean>;
}
export const providers: Provider[][] = [
  OrigamiPresenceOptions.provideFactory(() => ({present: signal(true)})),
  OrigamiCollapsibleOptions.provideFactory(() => ({expanded: signal(true), disabled: signal(false), hiding: signal<OrigamiCollapsibleHiding>('hidden')})),
  OrigamiCollapsibleOptions.provideExisting(() => AbstractCollapsible),
  OrigamiCollapsibleTriggerOptions.provideFactory(() => ({id: signal('trigger')})),
  OrigamiCollectionItemOptions.provideFactory(() => ({value: signal('item')})),
  OrigamiCollectionItemOptions.provideExisting(() => AbstractCollectionItem),
  OrigamiAccordionOptions.provideFactory(() => ({disabled: signal(false)})),
  OrigamiAccordionOptions.provideExisting(() => AbstractAccordion),
  OrigamiAccordionSingleOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false), collapsible: signal(true)})),
  OrigamiAccordionSingleOptions.provideExisting(() => AbstractAccordionSingle),
  OrigamiAccordionMultipleOptions.provideFactory(() => ({value: signal<readonly string[]>([]), disabled: signal(false)})),
  OrigamiAccordionMultipleOptions.provideExisting(() => AbstractAccordionMultiple),
  OrigamiAccordionTriggerOptions.provideFactory(() => ({id: signal('trigger')})),
  OrigamiAccordionTriggerOptions.provideExisting(() => AbstractIdentity),
  OrigamiAccordionPanelOptions.provideFactory(() => ({id: signal('panel')})),
  OrigamiAccordionPanelOptions.provideExisting(() => AbstractIdentity),
  OrigamiPopoverOptions.provideExisting(() => AbstractPopover),
  OrigamiPopoverOptions.provideFactory(() => ({open: signal(false), disabled: signal(false), dismissible: signal(true)})),
  OrigamiPopoverTriggerOptions.provideFactory(() => ({id: signal('trigger')})),
  OrigamiPopoverAnchorOptions.provideFactory(() => ({id: signal('anchor')})),
];
export function deferredCollapsible(): () => OrigamiCollapsibleOptions { return injectDeferred(OrigamiCollapsibleOptions); }
`;

await writeFile(providerFile, providerSource);
negativeEvidence.push(...(await verifyExpectedErrors(providerFile, providerSource)));

// Each negative template holds exactly one intended mismatch; a valid control per family
// proves the same imports/members compile, so a missing package cannot pass as a negative.
const families = {
  accordion: {
    imports: `import { OrigamiAccordionSingle, OrigamiAccordionMultiple } from "@loozo/origami-ui/accordion";`,
    directives: "OrigamiAccordionSingle, OrigamiAccordionMultiple",
    members: `
  readonly single = signal<string | null>(null);
  readonly multiple = signal<readonly string[]>([]);
  singleOutput(value: string | null): void { this.single.set(value); }
  multipleOutput(value: readonly string[]): void { this.multiple.set(value); }`,
  },
  foundation: {
    imports: `import { OrigamiPresence } from "@loozo/origami-ui/presence";
import { OrigamiCollapsible, OrigamiCollapsibleTrigger } from "@loozo/origami-ui/collapsible";`,
    directives: "OrigamiPresence, OrigamiCollapsible, OrigamiCollapsibleTrigger",
    members: `
  readonly present = signal(true);
  readonly wrongPresent = signal("wrong");
  expandedOutput(value: boolean): void { void value; }
  wrongOutput(value: string): void { void value; }`,
  },
};
const templates = [
  {
    name: "positive",
    family: "accordion",
    template: `<section ogAccordionSingle [(value)]="single" (valueChange)="singleOutput($event)"></section><section ogAccordionMultiple [(value)]="multiple" (valueChange)="multipleOutput($event)"></section>`,
  },
  {
    name: "single-input",
    family: "accordion",
    template: `<section ogAccordionSingle [value]="multiple()"></section>`,
    expected: {
      code: 2322,
      span: "value",
      message: /readonly string\[\].*not assignable to type 'string'/s,
    },
  },
  {
    name: "multiple-input",
    family: "accordion",
    template: `<section ogAccordionMultiple [value]="single()"></section>`,
    expected: {
      code: 2322,
      span: "value",
      message: /string \| null.*not assignable to type 'readonly string\[\]'/s,
    },
  },
  {
    name: "single-output",
    family: "accordion",
    template: `<section ogAccordionSingle (valueChange)="multipleOutput($event)"></section>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /string \| null.*not assignable to parameter of type 'readonly string\[\]'/s,
    },
  },
  {
    name: "multiple-output",
    family: "accordion",
    template: `<section ogAccordionMultiple (valueChange)="singleOutput($event)"></section>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /readonly string\[\].*not assignable to parameter of type 'string'/s,
    },
  },
  {
    name: "foundation-positive",
    family: "foundation",
    template: `<div ogPresence [(present)]="present"></div><section ogCollapsible (expandedChange)="expandedOutput($event)"><button ogCollapsibleTrigger [id]="'valid-id'">Valid</button></section>`,
  },
  {
    name: "presence-model",
    family: "foundation",
    template: `<div ogPresence [(present)]="wrongPresent"></div>`,
    expected: {
      code: 2322,
      span: "present",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "collapsible-output",
    family: "foundation",
    template: `<section ogCollapsible (expandedChange)="wrongOutput($event)"></section>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /Argument of type 'boolean' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "trigger-id",
    family: "foundation",
    template: `<section ogCollapsible><button ogCollapsibleTrigger [id]="4">Wrong ID</button></section>`,
    expected: {
      code: 2322,
      span: "id",
      message: /Type 'number' is not assignable to type 'string'/,
    },
  },
];
const templateEvidence = [];

for (const variant of templates) {
  const family = families[variant.family];
  const templateFile = path.join(directory, `${variant.name}.ts`);
  const source = `
import { Component, signal } from "@angular/core";
${family.imports}
@Component({ selector: "strict-mode-proof", imports: [${family.directives}], template: \`${variant.template}\` })
export class StrictModeProof {${family.members}
}
`;
  const templateStart = source.indexOf(variant.template);

  await writeFile(templateFile, source);

  const compiled = performCompilation({
    rootNames: [templateFile],
    options: {
      ...options,
      noEmit: false,
      outDir: path.join(directory, "emit", variant.name),
      strictTemplates: true,
      strictInjectionParameters: true,
      strictInputAccessModifiers: true,
      compilationMode: "full",
    },
  });
  const errors = compiled.diagnostics.filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  const diagnostics = [];

  for (const error of errors) {
    let span = null;

    if (error.file && typeof error.start === "number" && typeof error.length === "number") {
      span = {
        fileName: error.file.fileName,
        start: error.start,
        text: error.file.text.slice(error.start, error.start + error.length),
      };
    }

    diagnostics.push({
      code: error.code,
      message: ts.flattenDiagnosticMessageText(error.messageText, "\n"),
      span,
    });
  }

  if (variant.expected) {
    assert.equal(diagnostics.length, 1, `${variant.name}: exactly one intended diagnostic`);

    const [actual] = diagnostics;

    assert.equal(actual.code, variant.expected.code, `${variant.name}: ${actual.message}`);
    assert.match(actual.message, variant.expected.message);
    assert.ok(actual.span, `${variant.name}: diagnostic has a source location`);
    assert.equal(actual.span.fileName, templateFile);
    assert.equal(actual.span.text, variant.expected.span);
    assert.ok(
      actual.span.start >= templateStart &&
        actual.span.start < templateStart + variant.template.length,
      `${variant.name}: diagnostic must point into the intended template`,
    );
  } else {
    assert.deepEqual(diagnostics, [], `${variant.name}: valid control must compile`);
  }

  templateEvidence.push({ name: variant.name, negative: Boolean(variant.expected), diagnostics });
}

await mkdir(".acceptance-evidence", { recursive: true });
await writeFile(
  ".acceptance-evidence/type-and-template-results.json",
  JSON.stringify({ negativeEvidence, templateEvidence }, null, 2),
);
console.log(
  `P2: strict public positives; ${negativeEvidence.length} negatives each failing on exactly its own statement; ${templateEvidence.length} genuine AOT template checks passed.`,
);

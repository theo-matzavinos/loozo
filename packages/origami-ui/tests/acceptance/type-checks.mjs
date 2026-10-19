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
import { OrigamiAccordionOptions, OrigamiAccordionSingleOptions, OrigamiAccordionMultipleOptions, OrigamiAccordionItemOptions, OrigamiAccordionTriggerOptions, OrigamiAccordionPanelOptions } from '@loozo/origami-ui/accordion';
import { OrigamiPopoverOptions, OrigamiPopoverTriggerOptions, OrigamiPopoverAnchorOptions, OrigamiPopoverContentOptions, type OrigamiPopoverContentState } from '@loozo/origami-ui/popover';
import { OrigamiToggleOptions } from '@loozo/origami-ui/toggle';
import { OrigamiTabsOptions, OrigamiTabsTriggerOptions, OrigamiTabsPanelOptions, type OrigamiTabsOrientation, type OrigamiTabsActivation } from '@loozo/origami-ui/tabs';
import { OrigamiToggleGroupSingleOptions, OrigamiToggleGroupMultipleOptions, OrigamiToggleGroupItemOptions, type OrigamiToggleGroupOrientation } from '@loozo/origami-ui/toggle-group';
import { OrigamiToolbarOptions, type OrigamiToolbarOrientation } from '@loozo/origami-ui/toolbar';
import { OrigamiRadioGroupOptions, OrigamiRadioGroupItemOptions } from '@loozo/origami-ui/radio-group';
import { OrigamiButtonOptions } from '@loozo/origami-ui/button';
import { OrigamiTooltipOptions, OrigamiTooltipContentOptions, type OrigamiTooltipState, type OrigamiTooltipContentState, type OrigamiTooltipSide, type OrigamiTooltipAlign } from '@loozo/origami-ui/tooltip';
import * as tooltipEntry from '@loozo/origami-ui/tooltip';
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
OrigamiCollapsibleTriggerOptions.provideFactory(() => ({id: signal(1), disabled: signal(false), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a Collapsible Trigger factory must supply disabled and focusableWhenDisabled
OrigamiCollapsibleTriggerOptions.provideFactory(() => ({id: signal('trigger')}));
// @ts-expect-error Collapsible Trigger focusableWhenDisabled must be a boolean signal
OrigamiCollapsibleTriggerOptions.provideFactory(() => ({id: signal('trigger'), disabled: signal(false), focusableWhenDisabled: signal('yes')}));
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
// @ts-expect-error an Accordion Item factory must supply hiding
OrigamiAccordionItemOptions.provideFactory(() => ({value: signal('billing'), disabled: signal(false)}));
// @ts-expect-error Accordion Item value must be a string signal
OrigamiAccordionItemOptions.provideFactory(() => ({value: signal(1), disabled: signal(false), hiding: signal<OrigamiCollapsibleHiding>('hidden')}));
// @ts-expect-error Accordion Item hiding is hidden or until-found
OrigamiAccordionItemOptions.provideFactory(() => ({value: signal('billing'), disabled: signal(false), hiding: signal('collapsed')}));
// @ts-expect-error Accordion Trigger id remains a typed signal
OrigamiAccordionTriggerOptions.provideFactory(() => ({id: signal(1), focusableWhenDisabled: signal(false)}));
// @ts-expect-error an Accordion Trigger factory must supply focusableWhenDisabled
OrigamiAccordionTriggerOptions.provideFactory(() => ({id: signal('trigger')}));
// Positive: Accordion Panel also has id-only Options.
OrigamiAccordionPanelOptions.provideFactory(() => ({id: signal('valid-id-only')}));
// @ts-expect-error Accordion Panel id must be a string signal
OrigamiAccordionPanelOptions.provideFactory(() => ({id: signal(1)}));
// @ts-expect-error Popover writable open cannot be a readonly computation
OrigamiPopoverOptions.provideFactory(() => ({open: computed(() => false), disabled: signal(false), dismissible: signal(true)}));
// @ts-expect-error Popover Trigger id remains a typed signal
OrigamiPopoverTriggerOptions.provideFactory(() => ({id: signal(1), disabled: signal(false), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a Popover Trigger factory must supply disabled
OrigamiPopoverTriggerOptions.provideFactory(() => ({id: signal('trigger'), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a Popover Trigger factory must supply focusableWhenDisabled
OrigamiPopoverTriggerOptions.provideFactory(() => ({id: signal('trigger'), disabled: signal(false)}));
// @ts-expect-error Anchor id remains a typed signal
OrigamiPopoverAnchorOptions.provideFactory(() => ({id: signal(1)}));
// @ts-expect-error Content requires the complete four-field signal shape
OrigamiPopoverContentOptions.provideFactory(() => ({id: signal('only-id')}));
class WrongExistingTrigger { readonly id = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); }
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
// @ts-expect-error Toggle pressed must be writable
OrigamiToggleOptions.provideFactory(() => ({pressed: computed(() => false), disabled: signal(false), focusableWhenDisabled: signal(false)}));
// @ts-expect-error Toggle pressed must be a boolean signal
OrigamiToggleOptions.provideFactory(() => ({pressed: signal('pressed'), disabled: signal(false), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a Toggle factory must supply disabled
OrigamiToggleOptions.provideFactory(() => ({pressed: signal(false), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a Toggle factory must supply focusableWhenDisabled
OrigamiToggleOptions.provideFactory(() => ({pressed: signal(false), disabled: signal(false)}));
// @ts-expect-error Tabs value must be writable
OrigamiTabsOptions.provideFactory(() => ({value: computed<string | null>(() => null), disabled: signal(false), orientation: signal<OrigamiTabsOrientation>('horizontal'), activation: signal<OrigamiTabsActivation>('automatic')}));
// @ts-expect-error Tabs orientation is horizontal or vertical
OrigamiTabsOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false), orientation: signal('diagonal'), activation: signal<OrigamiTabsActivation>('automatic')}));
// @ts-expect-error a Tabs factory must supply activation
OrigamiTabsOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false), orientation: signal<OrigamiTabsOrientation>('horizontal')}));
// @ts-expect-error a Tabs Trigger factory must supply disabled
OrigamiTabsTriggerOptions.provideFactory(() => ({value: signal('billing'), id: signal('billing-tab'), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a Tabs Trigger factory must supply focusableWhenDisabled
OrigamiTabsTriggerOptions.provideFactory(() => ({value: signal('billing'), id: signal('billing-tab'), disabled: signal(false)}));
// @ts-expect-error a Tabs Panel factory must supply value
OrigamiTabsPanelOptions.provideFactory(() => ({id: signal('billing-panel')}));
// @ts-expect-error ToggleGroup Single value must be writable
OrigamiToggleGroupSingleOptions.provideFactory(() => ({value: computed<string | null>(() => null), disabled: signal(false), orientation: signal<OrigamiToggleGroupOrientation>('horizontal'), deselectable: signal(false)}));
// @ts-expect-error ToggleGroup orientation is horizontal or vertical
OrigamiToggleGroupSingleOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false), orientation: signal('diagonal'), deselectable: signal(false)}));
// @ts-expect-error a ToggleGroup Single factory must supply deselectable
OrigamiToggleGroupSingleOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false), orientation: signal<OrigamiToggleGroupOrientation>('horizontal')}));
// @ts-expect-error ToggleGroup Multiple value must be writable
OrigamiToggleGroupMultipleOptions.provideFactory(() => ({value: computed<readonly string[]>(() => []), disabled: signal(false), orientation: signal<OrigamiToggleGroupOrientation>('horizontal')}));
// @ts-expect-error a ToggleGroup Item factory must supply disabled
OrigamiToggleGroupItemOptions.provideFactory(() => ({value: signal('bold'), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a ToggleGroup Item factory must supply focusableWhenDisabled
OrigamiToggleGroupItemOptions.provideFactory(() => ({value: signal('bold'), disabled: signal(false)}));
// @ts-expect-error Toolbar orientation is horizontal or vertical
OrigamiToolbarOptions.provideFactory(() => ({orientation: signal('diagonal')}));
// @ts-expect-error a Button factory must supply disabled
OrigamiButtonOptions.provideFactory(() => ({focusableWhenDisabled: signal(false)}));
// @ts-expect-error a Button factory must supply focusableWhenDisabled
OrigamiButtonOptions.provideFactory(() => ({disabled: signal(false)}));
// @ts-expect-error Button disabled must be a boolean signal
OrigamiButtonOptions.provideFactory(() => ({disabled: signal('no'), focusableWhenDisabled: signal(false)}));
// @ts-expect-error Tooltip open must be writable
OrigamiTooltipOptions.provideFactory(() => ({open: computed(() => false), disabled: signal(false), openDelay: signal(600)}));
// @ts-expect-error a Tooltip root factory must supply openDelay
OrigamiTooltipOptions.provideFactory(() => ({open: signal(false), disabled: signal(false)}));
// @ts-expect-error Tooltip openDelay must be a number signal
OrigamiTooltipOptions.provideFactory(() => ({open: signal(false), disabled: signal(false), openDelay: signal('600')}));
// @ts-expect-error Tooltip Content requires the complete four-field signal shape
OrigamiTooltipContentOptions.provideFactory(() => ({id: signal('hint'), side: signal<OrigamiTooltipSide>('block-start'), align: signal<OrigamiTooltipAlign>('center')}));
// @ts-expect-error Tooltip Content side is a logical side
OrigamiTooltipContentOptions.provideFactory(() => ({id: signal('hint'), side: signal('top'), align: signal<OrigamiTooltipAlign>('center'), gap: signal(0)}));
// @ts-expect-error the Tooltip Trigger has no inputs, so no Options token
void tooltipEntry.OrigamiTooltipTriggerOptions;
declare const tooltipState: OrigamiTooltipState;
declare const tooltipContentState: OrigamiTooltipContentState;
// @ts-expect-error Tooltip State open is readonly
tooltipState.open.set(true);
// @ts-expect-error Tooltip State disabled is readonly
tooltipState.disabled.set(true);
// @ts-expect-error Tooltip Content State open is readonly
tooltipContentState.open.set(false);
// @ts-expect-error Tooltip Content State has no public Presence phase alias
void tooltipContentState.phase;
// @ts-expect-error RadioGroup value must be writable
OrigamiRadioGroupOptions.provideFactory(() => ({value: computed<string | null>(() => null), disabled: signal(false)}));
// @ts-expect-error RadioGroup value is a nullable string
OrigamiRadioGroupOptions.provideFactory(() => ({value: signal(1), disabled: signal(false)}));
// @ts-expect-error a RadioGroup factory must supply disabled
OrigamiRadioGroupOptions.provideFactory(() => ({value: signal<string | null>(null)}));
// @ts-expect-error a RadioGroup Item factory must supply disabled
OrigamiRadioGroupItemOptions.provideFactory(() => ({value: signal('express'), focusableWhenDisabled: signal(false)}));
// @ts-expect-error a RadioGroup Item factory must supply focusableWhenDisabled
OrigamiRadioGroupItemOptions.provideFactory(() => ({value: signal('express'), disabled: signal(false)}));
class WrongPresent { readonly present = signal(1); }
class WrongRoot { readonly expanded = signal(1); readonly disabled = signal(false); readonly hiding = signal<OrigamiCollapsibleHiding>('hidden'); }
class WrongIdentity { readonly id = signal(7); }
class WrongToggle { readonly pressed = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); }
class WrongTabsTrigger { readonly value = signal(1); readonly id = signal('tab'); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); }
class WrongAccordionItem { readonly value = signal('billing'); readonly disabled = signal('no'); readonly hiding = signal<OrigamiCollapsibleHiding>('hidden'); }
class WrongToggleGroupItem { readonly value = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); }
class WrongButton { readonly disabled = signal(false); readonly focusableWhenDisabled = signal('no'); }
class WrongRadioGroupItem { readonly value = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); }
class WrongTooltip { readonly open = signal(false); readonly disabled = signal(false); readonly openDelay = signal('fast'); }
// @ts-expect-error incompatible existing Presence class
OrigamiPresenceOptions.provideExisting(() => WrongPresent);
// @ts-expect-error incompatible existing Collapsible root class
OrigamiCollapsibleOptions.provideExisting(() => WrongRoot);
// @ts-expect-error incompatible existing Collapsible Trigger class
OrigamiCollapsibleTriggerOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Collapsible Panel class
OrigamiCollapsiblePanelOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Accordion Item class
OrigamiAccordionItemOptions.provideExisting(() => WrongAccordionItem);
// @ts-expect-error incompatible existing Toggle class
OrigamiToggleOptions.provideExisting(() => WrongToggle);
// @ts-expect-error incompatible existing Tabs Trigger class
OrigamiTabsTriggerOptions.provideExisting(() => WrongTabsTrigger);
// @ts-expect-error incompatible existing ToggleGroup Item class
OrigamiToggleGroupItemOptions.provideExisting(() => WrongToggleGroupItem);
// @ts-expect-error incompatible existing Button class
OrigamiButtonOptions.provideExisting(() => WrongButton);
// @ts-expect-error incompatible existing RadioGroup Item class
OrigamiRadioGroupItemOptions.provideExisting(() => WrongRadioGroupItem);
// @ts-expect-error incompatible existing Tooltip root class
OrigamiTooltipOptions.provideExisting(() => WrongTooltip);
// Positive: complete factories and abstract existing classes return one ordinary Provider.
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
abstract class AbstractAccordionItem {
  abstract readonly value: Signal<string>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly hiding: Signal<OrigamiCollapsibleHiding>;
}
abstract class AbstractIdentity {
  abstract readonly id: Signal<string>;
}
abstract class AbstractAccordionTrigger {
  abstract readonly id: Signal<string>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
}
abstract class AbstractPopoverTrigger {
  abstract readonly id: Signal<string>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
}
abstract class AbstractPopover {
  abstract readonly open: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly dismissible: Signal<boolean>;
}
abstract class AbstractToggle {
  abstract readonly pressed: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
}
abstract class AbstractTabs {
  abstract readonly value: WritableSignal<string | null>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly orientation: Signal<OrigamiTabsOrientation>;
  abstract readonly activation: Signal<OrigamiTabsActivation>;
}
abstract class AbstractTabsPart {
  abstract readonly value: Signal<string>;
  abstract readonly id: Signal<string>;
}
abstract class AbstractToggleGroupSingle {
  abstract readonly value: WritableSignal<string | null>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;
  abstract readonly deselectable: Signal<boolean>;
}
abstract class AbstractToggleGroupItem {
  abstract readonly value: Signal<string>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
}
abstract class AbstractToolbar {
  abstract readonly orientation: Signal<OrigamiToolbarOrientation>;
}
abstract class AbstractButton {
  abstract readonly disabled: Signal<boolean>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
}
abstract class AbstractRadioGroup {
  abstract readonly value: WritableSignal<string | null>;
  abstract readonly disabled: Signal<boolean>;
}
abstract class AbstractTooltip {
  abstract readonly open: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly openDelay: Signal<number>;
}
abstract class AbstractTooltipContent {
  abstract readonly id: Signal<string>;
  abstract readonly side: Signal<OrigamiTooltipSide>;
  abstract readonly align: Signal<OrigamiTooltipAlign>;
  abstract readonly gap: Signal<number>;
}
abstract class AbstractRadioGroupItem {
  abstract readonly value: Signal<string>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
}
export const providers: Provider[] = [
  OrigamiPresenceOptions.provideFactory(() => ({present: signal(true)})),
  OrigamiCollapsibleOptions.provideFactory(() => ({expanded: signal(true), disabled: signal(false), hiding: signal<OrigamiCollapsibleHiding>('hidden')})),
  OrigamiCollapsibleOptions.provideExisting(() => AbstractCollapsible),
  OrigamiCollapsibleTriggerOptions.provideFactory(() => ({id: signal('trigger'), disabled: computed(() => false), focusableWhenDisabled: signal(true)})),
  OrigamiCollectionItemOptions.provideFactory(() => ({value: signal('item')})),
  OrigamiCollectionItemOptions.provideExisting(() => AbstractCollectionItem),
  OrigamiAccordionOptions.provideFactory(() => ({disabled: signal(false)})),
  OrigamiAccordionOptions.provideExisting(() => AbstractAccordion),
  OrigamiAccordionSingleOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false), collapsible: signal(true)})),
  OrigamiAccordionSingleOptions.provideExisting(() => AbstractAccordionSingle),
  OrigamiAccordionMultipleOptions.provideFactory(() => ({value: signal<readonly string[]>([]), disabled: signal(false)})),
  OrigamiAccordionMultipleOptions.provideExisting(() => AbstractAccordionMultiple),
  OrigamiAccordionItemOptions.provideFactory(() => ({value: signal('billing'), disabled: computed(() => false), hiding: signal<OrigamiCollapsibleHiding>('until-found')})),
  OrigamiAccordionItemOptions.provideExisting(() => AbstractAccordionItem),
  OrigamiAccordionTriggerOptions.provideFactory(() => ({id: signal('trigger'), focusableWhenDisabled: computed(() => false)})),
  OrigamiAccordionTriggerOptions.provideExisting(() => AbstractAccordionTrigger),
  OrigamiAccordionPanelOptions.provideFactory(() => ({id: signal('panel')})),
  OrigamiAccordionPanelOptions.provideExisting(() => AbstractIdentity),
  OrigamiPopoverOptions.provideExisting(() => AbstractPopover),
  OrigamiPopoverOptions.provideFactory(() => ({open: signal(false), disabled: signal(false), dismissible: signal(true)})),
  OrigamiPopoverTriggerOptions.provideFactory(() => ({id: signal('trigger'), disabled: computed(() => false), focusableWhenDisabled: signal(true)})),
  OrigamiPopoverTriggerOptions.provideExisting(() => AbstractPopoverTrigger),
  OrigamiPopoverAnchorOptions.provideFactory(() => ({id: signal('anchor')})),
  OrigamiToggleOptions.provideFactory(() => ({pressed: signal(false), disabled: computed(() => false), focusableWhenDisabled: signal(false)})),
  OrigamiToggleOptions.provideExisting(() => AbstractToggle),
  OrigamiTabsOptions.provideFactory(() => ({value: signal<string | null>('billing'), disabled: computed(() => false), orientation: signal<OrigamiTabsOrientation>('vertical'), activation: signal<OrigamiTabsActivation>('manual')})),
  OrigamiTabsOptions.provideExisting(() => AbstractTabs),
  OrigamiTabsTriggerOptions.provideFactory(() => ({value: signal('billing'), id: signal('billing-tab'), disabled: computed(() => false), focusableWhenDisabled: signal(false)})),
  OrigamiTabsPanelOptions.provideFactory(() => ({value: signal('billing'), id: signal('billing-panel')})),
  OrigamiTabsPanelOptions.provideExisting(() => AbstractTabsPart),
  OrigamiToggleGroupSingleOptions.provideFactory(() => ({value: signal<string | null>('start'), disabled: computed(() => false), orientation: signal<OrigamiToggleGroupOrientation>('vertical'), deselectable: signal(true)})),
  OrigamiToggleGroupSingleOptions.provideExisting(() => AbstractToggleGroupSingle),
  OrigamiToggleGroupMultipleOptions.provideFactory(() => ({value: signal<readonly string[]>(['bold']), disabled: signal(false), orientation: signal<OrigamiToggleGroupOrientation>('horizontal')})),
  OrigamiToggleGroupItemOptions.provideFactory(() => ({value: signal('bold'), disabled: computed(() => false), focusableWhenDisabled: signal(false)})),
  OrigamiToggleGroupItemOptions.provideExisting(() => AbstractToggleGroupItem),
  OrigamiToolbarOptions.provideFactory(() => ({orientation: signal<OrigamiToolbarOrientation>('vertical')})),
  OrigamiToolbarOptions.provideExisting(() => AbstractToolbar),
  OrigamiButtonOptions.provideFactory(() => ({disabled: computed(() => false), focusableWhenDisabled: signal(true)})),
  OrigamiButtonOptions.provideExisting(() => AbstractButton),
  OrigamiRadioGroupOptions.provideFactory(() => ({value: signal<string | null>('express'), disabled: computed(() => false)})),
  OrigamiRadioGroupOptions.provideExisting(() => AbstractRadioGroup),
  OrigamiRadioGroupItemOptions.provideFactory(() => ({value: signal('express'), disabled: computed(() => false), focusableWhenDisabled: signal(false)})),
  OrigamiRadioGroupItemOptions.provideExisting(() => AbstractRadioGroupItem),
  OrigamiTooltipOptions.provideFactory(() => ({open: signal(false), disabled: computed(() => false), openDelay: computed(() => 0)})),
  OrigamiTooltipOptions.provideExisting(() => AbstractTooltip),
  OrigamiTooltipContentOptions.provideFactory(() => ({id: signal('hint'), side: signal<OrigamiTooltipSide>('block-end'), align: signal<OrigamiTooltipAlign>('end'), gap: signal(6)})),
  OrigamiTooltipContentOptions.provideExisting(() => AbstractTooltipContent),
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
  toggle: {
    imports: `import { OrigamiToggle } from "@loozo/origami-ui/toggle";`,
    directives: "OrigamiToggle",
    members: `
  readonly pressed = signal(false);
  readonly wrongPressed = signal("pressed");
  pressedOutput(value: boolean): void { void value; }
  wrongOutput(value: string): void { void value; }`,
  },
  tabs: {
    imports: `import { OrigamiTabs, OrigamiTabsList, OrigamiTabsTrigger, OrigamiTabsPanel } from "@loozo/origami-ui/tabs";`,
    directives: "OrigamiTabs, OrigamiTabsList, OrigamiTabsTrigger, OrigamiTabsPanel",
    members: `
  readonly selected = signal<string | null>(null);
  readonly wrongSelected = signal(1);
  valueOutput(value: string | null): void { void value; }
  wrongOutput(value: number): void { void value; }`,
  },
  "toggle-group": {
    imports: `import { OrigamiToggleGroupSingle, OrigamiToggleGroupMultiple, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";`,
    directives: "OrigamiToggleGroupSingle, OrigamiToggleGroupMultiple, OrigamiToggleGroupItem",
    members: `
  readonly alignment = signal<string | null>(null);
  readonly marks = signal<readonly string[]>([]);
  alignmentOutput(value: string | null): void { void value; }
  marksOutput(value: readonly string[]): void { void value; }
  wrongOutput(value: number): void { void value; }`,
  },
  toolbar: {
    imports: `import { OrigamiToolbar, OrigamiToolbarItem, OrigamiToolbarToggle, OrigamiToolbarPopoverTrigger } from "@loozo/origami-ui/toolbar";
import { OrigamiPopover } from "@loozo/origami-ui/popover";
import { OrigamiToggleState } from "@loozo/origami-ui/toggle";
import { OrigamiToggleGroupMultiple, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";`,
    directives:
      "OrigamiToolbar, OrigamiToolbarItem, OrigamiToolbarToggle, OrigamiToolbarPopoverTrigger, OrigamiPopover, OrigamiToggleGroupMultiple, OrigamiToggleGroupItem",
    members: `
  readonly pressed = signal(false);
  readonly wrongPressed = signal("pressed");
  readonly marks = signal<readonly string[]>([]);
  observeToggle(state: OrigamiToggleState): void { void state; }
  observeString(value: string): void { void value; }`,
  },
  button: {
    imports: `import { OrigamiButton } from "@loozo/origami-ui/button";`,
    directives: "OrigamiButton",
    members: `
  readonly saving = signal(false);`,
  },
  tooltip: {
    imports: `import { OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent, OrigamiTooltipState, OrigamiTooltipContentState } from "@loozo/origami-ui/tooltip";
import { OrigamiButton } from "@loozo/origami-ui/button";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";`,
    directives:
      "OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent, OrigamiButton, OrigamiToggle",
    members: `
  readonly open = signal(false);
  readonly wrongOpen = signal("open");
  readonly pressed = signal(false);
  openOutput(value: boolean): void { void value; }
  observeTooltip(state: OrigamiTooltipState): void { void state; }
  observeContent(state: OrigamiTooltipContentState): void { void state; }
  observeString(value: string): void { void value; }`,
  },
  state: {
    imports: `import { OrigamiPresenceState } from "@loozo/origami-ui/presence";
import { OrigamiCollapsible, OrigamiCollapsiblePanel, OrigamiCollapsibleState } from "@loozo/origami-ui/collapsible";
import { OrigamiAccordionSingle, OrigamiAccordionItem, OrigamiAccordionPanel } from "@loozo/origami-ui/accordion";
import { OrigamiToggleState } from "@loozo/origami-ui/toggle";
import { OrigamiToggleGroupSingle, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";`,
    directives:
      "OrigamiCollapsible, OrigamiCollapsiblePanel, OrigamiAccordionSingle, OrigamiAccordionItem, OrigamiAccordionPanel, OrigamiToggleGroupSingle, OrigamiToggleGroupItem",
    members: `
  observeCollapsible(state: OrigamiCollapsibleState): void { void state; }
  observePresence(state: OrigamiPresenceState): void { void state; }
  observeToggle(state: OrigamiToggleState): void { void state; }
  observeBoolean(value: boolean): void { void value; }`,
  },
  "radio-group": {
    imports: `import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import { OrigamiToolbar, OrigamiToolbarItem } from "@loozo/origami-ui/toolbar";`,
    directives: "OrigamiRadioGroup, OrigamiRadioGroupItem, OrigamiToolbar, OrigamiToolbarItem",
    members: `
  readonly speed = signal<string | null>(null);
  readonly wrongSpeed = signal(1);
  speedOutput(value: string | null): void { void value; }
  wrongOutput(value: number): void { void value; }`,
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
  {
    name: "toggle-positive",
    family: "toggle",
    template: `<button ogToggle [(pressed)]="pressed" disabled (pressedChange)="pressedOutput($event)">Valid</button>`,
  },
  {
    name: "toggle-model",
    family: "toggle",
    template: `<button ogToggle [(pressed)]="wrongPressed">Wrong model</button>`,
    expected: {
      code: 2322,
      span: "pressed",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "toggle-output",
    family: "toggle",
    template: `<button ogToggle (pressedChange)="wrongOutput($event)">Wrong output</button>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /Argument of type 'boolean' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "tabs-positive",
    family: "tabs",
    template: `<section ogTabs [(value)]="selected" orientation="vertical" activation="manual" disabled (valueChange)="valueOutput($event)"><div ogTabsList aria-label="Sections"><button ogTabsTrigger value="one" disabled>One</button></div><div ogTabsPanel value="one">One</div></section>`,
  },
  {
    name: "tabs-model",
    family: "tabs",
    template: `<section ogTabs [(value)]="wrongSelected"></section>`,
    expected: {
      code: 2322,
      span: "value",
      message: /Type 'number' is not assignable to type 'string'/,
    },
  },
  {
    name: "tabs-output",
    family: "tabs",
    template: `<section ogTabs (valueChange)="wrongOutput($event)"></section>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /Argument of type 'string \| null' is not assignable to parameter of type 'number'/,
    },
  },
  {
    name: "tabs-orientation",
    family: "tabs",
    template: `<section ogTabs orientation="diagonal"></section>`,
    expected: {
      code: 2322,
      span: "orientation",
      message: /Type '"diagonal"' is not assignable to type 'OrigamiTabsOrientation'/,
    },
  },
  {
    name: "tabs-activation",
    family: "tabs",
    template: `<section ogTabs activation="auto"></section>`,
    expected: {
      code: 2322,
      span: "activation",
      message: /Type '"auto"' is not assignable to type 'OrigamiTabsActivation'/,
    },
  },
  {
    name: "toggle-group-positive",
    family: "toggle-group",
    template: `<div ogToggleGroupSingle [(value)]="alignment" orientation="vertical" deselectable disabled (valueChange)="alignmentOutput($event)"><button ogToggleGroupItem value="start" disabled>Start</button></div><div ogToggleGroupMultiple [(value)]="marks" (valueChange)="marksOutput($event)"><button ogToggleGroupItem value="bold">Bold</button></div>`,
  },
  {
    name: "toggle-group-single-model",
    family: "toggle-group",
    template: `<div ogToggleGroupSingle [(value)]="marks"></div>`,
    expected: {
      code: 2322,
      span: "value",
      message: /Type 'readonly string\[\]' is not assignable to type 'string'/,
    },
  },
  {
    name: "toggle-group-multiple-output",
    family: "toggle-group",
    template: `<div ogToggleGroupMultiple (valueChange)="wrongOutput($event)"></div>`,
    expected: {
      code: 2345,
      span: "$event",
      message:
        /Argument of type 'readonly string\[\]' is not assignable to parameter of type 'number'/,
    },
  },
  {
    name: "toggle-group-orientation",
    family: "toggle-group",
    template: `<div ogToggleGroupMultiple orientation="diagonal"></div>`,
    expected: {
      code: 2322,
      span: "orientation",
      message: /Type '"diagonal"' is not assignable to type 'OrigamiToggleGroupOrientation'/,
    },
  },
  {
    name: "toggle-group-multiple-deselectable",
    family: "toggle-group",
    template: `<div ogToggleGroupMultiple [deselectable]="true"></div>`,
    expected: {
      code: -998002,
      span: '[deselectable]="true"',
      message: /Can't bind to 'deselectable' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "toolbar-positive",
    family: "toolbar",
    template: `<div ogToolbar orientation="vertical" aria-label="Editing"><button ogToolbarItem disabled focusableWhenDisabled>Undo</button><button ogToolbarToggle #spelling="ogToolbarToggle" [(pressed)]="pressed" [disabled]="false" focusableWhenDisabled (click)="observeToggle(spelling.state)">Spell check</button><span ogPopover><button ogToolbarPopoverTrigger id="insert" disabled focusableWhenDisabled>Insert</button></span><div ogToggleGroupMultiple [(value)]="marks"><button ogToggleGroupItem value="bold" focusableWhenDisabled>Bold</button></div></div>`,
  },
  {
    name: "toolbar-toggle-model",
    family: "toolbar",
    template: `<div ogToolbar aria-label="Editing"><button ogToolbarToggle [(pressed)]="wrongPressed">Spell check</button></div>`,
    expected: {
      code: 2322,
      span: "pressed",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "toolbar-toggle-state",
    family: "toolbar",
    template: `<div ogToolbar aria-label="Editing"><button ogToolbarToggle #spelling="ogToolbarToggle" (click)="observeString(spelling.state)">Spell check</button></div>`,
    expected: {
      code: 2345,
      span: "state",
      message: /'OrigamiToggleState' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "toolbar-popover-trigger-id",
    family: "toolbar",
    template: `<div ogToolbar aria-label="Editing"><span ogPopover><button ogToolbarPopoverTrigger [id]="4">Insert</button></span></div>`,
    expected: {
      code: 2322,
      span: "id",
      message: /Type 'number' is not assignable to type 'string'/,
    },
  },
  {
    name: "button-positive",
    family: "button",
    template: `<button ogButton [disabled]="saving()" focusableWhenDisabled>Save</button>`,
  },
  {
    name: "tooltip-positive",
    family: "tooltip",
    template: `<span ogTooltip #tooltip="ogTooltip" [(open)]="open" disabled [openDelay]="200" (openChange)="openOutput($event)"><button ogButton ogTooltipTrigger [disabled]="true" focusableWhenDisabled aria-label="Save" (click)="observeTooltip(tooltip.state)">S</button><span ogTooltipContent #content="ogTooltipContent" id="hint" side="block-end" align="end" [gap]="6" (click)="observeContent(content.state)">Saves the draft</span></span><span ogTooltip><button ogToggle ogTooltipTrigger [(pressed)]="pressed" aria-label="Bold">B</button><span ogTooltipContent>Bold text</span></span>`,
  },
  {
    name: "tooltip-model",
    family: "tooltip",
    template: `<span ogTooltip [(open)]="wrongOpen"></span>`,
    expected: {
      code: 2322,
      span: "open",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "tooltip-open-delay",
    family: "tooltip",
    template: `<span ogTooltip [openDelay]="'fast'"></span>`,
    expected: {
      code: 2322,
      span: "openDelay",
      message: /Type 'string' is not assignable to type 'number'/,
    },
  },
  {
    name: "tooltip-side",
    family: "tooltip",
    template: `<span ogTooltip><span ogTooltipContent side="top"></span></span>`,
    expected: {
      code: 2322,
      span: "side",
      message: /Type '"top"' is not assignable to type 'OrigamiTooltipSide'/,
    },
  },
  {
    name: "tooltip-trigger-input",
    family: "tooltip",
    template: `<span ogTooltip><button ogTooltipTrigger [openDelay]="0">T</button></span>`,
    expected: {
      code: -998002,
      span: `[openDelay]="0"`,
      message: /Can't bind to 'openDelay' since it isn't a known property of 'button'/,
    },
  },
  {
    name: "tooltip-content-state",
    family: "tooltip",
    template: `<span ogTooltip><span ogTooltipContent #content="ogTooltipContent" (click)="observeString(content.state)"></span></span>`,
    expected: {
      code: 2345,
      span: "state",
      message: /'OrigamiTooltipContentState' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "toolbar-orientation",
    family: "toolbar",
    template: `<div ogToolbar orientation="diagonal"></div>`,
    expected: {
      code: 2322,
      span: "orientation",
      message: /Type '"diagonal"' is not assignable to type 'OrigamiToolbarOrientation'/,
    },
  },
  {
    name: "radio-group-positive",
    family: "radio-group",
    template: `<div ogRadioGroup [(value)]="speed" disabled aria-label="Speed" (valueChange)="speedOutput($event)"><button ogRadioGroupItem value="standard" disabled>Standard</button></div><div ogToolbar aria-label="Text"><button ogToolbarItem>Copy</button><div ogRadioGroup [(value)]="speed" aria-label="Alignment"><button ogRadioGroupItem value="left">Left</button></div></div>`,
  },
  {
    name: "radio-group-model",
    family: "radio-group",
    template: `<div ogRadioGroup [(value)]="wrongSpeed"></div>`,
    expected: {
      code: 2322,
      span: "value",
      message: /Type 'number' is not assignable to type 'string'/,
    },
  },
  {
    name: "radio-group-output",
    family: "radio-group",
    template: `<div ogRadioGroup (valueChange)="wrongOutput($event)"></div>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /Argument of type 'string \| null' is not assignable to parameter of type 'number'/,
    },
  },
  {
    name: "radio-group-orientation",
    family: "radio-group",
    template: `<div ogRadioGroup [orientation]="'vertical'"></div>`,
    expected: {
      code: -998002,
      span: `[orientation]="'vertical'"`,
      message: /Can't bind to 'orientation' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "state-positive",
    family: "state",
    template: `<section ogAccordionSingle><article ogAccordionItem #item="ogAccordionItem" (click)="observeCollapsible(item.state); observeBoolean(item.state.expanded()); observeBoolean(item.state.disabled())"><div ogAccordionPanel #panel="ogAccordionPanel" (click)="observePresence(panel.state); observeBoolean(panel.state.open())"></div></article></section><section ogCollapsible><div ogCollapsiblePanel #collapsiblePanel="ogCollapsiblePanel" (click)="observePresence(collapsiblePanel.state); observeBoolean(collapsiblePanel.state.open())"></div></section><div ogToggleGroupSingle><button ogToggleGroupItem #toggleItem="ogToggleGroupItem" (click)="observeToggle(toggleItem.state); observeBoolean(toggleItem.state.pressed()); observeBoolean(toggleItem.state.disabled())">Bold</button></div>`,
  },
  {
    name: "accordion-item-state",
    family: "state",
    template: `<section ogAccordionSingle><article ogAccordionItem #item="ogAccordionItem" (click)="observePresence(item.state)"></article></section>`,
    expected: {
      code: 2345,
      span: "state",
      message:
        /'OrigamiCollapsibleState' is not assignable to parameter of type 'OrigamiPresenceState'/,
    },
  },
  {
    name: "accordion-panel-state",
    family: "state",
    template: `<section ogAccordionSingle><article ogAccordionItem><div ogAccordionPanel #panel="ogAccordionPanel" (click)="observeCollapsible(panel.state)"></div></article></section>`,
    expected: {
      code: 2345,
      span: "state",
      message:
        /'OrigamiPresenceState' is not assignable to parameter of type 'OrigamiCollapsibleState'/,
    },
  },
  {
    name: "collapsible-panel-state",
    family: "state",
    template: `<section ogCollapsible><div ogCollapsiblePanel #collapsiblePanel="ogCollapsiblePanel" (click)="observeToggle(collapsiblePanel.state)"></div></section>`,
    expected: {
      code: 2345,
      span: "state",
      message: /'OrigamiPresenceState' is not assignable to parameter of type 'OrigamiToggleState'/,
    },
  },
  {
    name: "toggle-group-item-state",
    family: "state",
    template: `<div ogToggleGroupSingle><button ogToggleGroupItem #toggleItem="ogToggleGroupItem" (click)="observeCollapsible(toggleItem.state)">Bold</button></div>`,
    expected: {
      code: 2345,
      span: "state",
      message:
        /'OrigamiToggleState' is not assignable to parameter of type 'OrigamiCollapsibleState'/,
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

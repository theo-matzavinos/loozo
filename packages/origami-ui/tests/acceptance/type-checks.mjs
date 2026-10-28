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
import { booleanAttribute, computed, input, model, output, signal, type Provider, type Signal, type WritableSignal } from '@angular/core';
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
import { OrigamiFieldLabelOptions, OrigamiFieldControlOptions, OrigamiFieldDescriptionOptions, OrigamiFieldErrorOptions, type OrigamiFieldState } from '@loozo/origami-ui/field';
import * as fieldEntry from '@loozo/origami-ui/field';
import { OrigamiCheckboxOptions, type OrigamiCheckboxState } from '@loozo/origami-ui/checkbox';
import { OrigamiSwitchOptions, type OrigamiSwitchState } from '@loozo/origami-ui/switch';
import { OrigamiDialogOptions, OrigamiAlertDialogOptions, OrigamiDialogTriggerOptions, OrigamiDialogContentOptions, OrigamiDialogTitleOptions, OrigamiDialogDescriptionOptions, OrigamiDialogCloseOptions, injectOrigamiDialogOpener, type OrigamiDialogState, type OrigamiDialogContentState, type OrigamiDialogBindings, type OrigamiDialogOpener, type OrigamiDialogRef } from '@loozo/origami-ui/dialog';
import { OrigamiSelectOptions, OrigamiSelectMultipleOptions, OrigamiSelectTriggerOptions, OrigamiSelectContentOptions, OrigamiSelectOptionOptions, type OrigamiSelectState, type OrigamiSelectMultipleState, type OrigamiSelectOptionState, type OrigamiSelectOptionRecord } from '@loozo/origami-ui/select';
import { OrigamiCalendarOptions, OrigamiCalendarMultipleOptions, OrigamiCalendarRangeOptions, OrigamiMonthCalendarOptions, OrigamiCalendarCellOptions, OrigamiCalendarHeadingOptions, type OrigamiMonthCalendarState, type OrigamiCalendarPeriodRecord, type OrigamiCalendarState, type OrigamiCalendarMultipleState, type OrigamiCalendarRangeState, type OrigamiCalendarDayRecord, type OrigamiDateRange } from '@loozo/origami-ui/calendar';
import { OrigamiDateFieldOptions, OrigamiDateFieldSegmentOptions, OrigamiTimeFieldOptions, OrigamiDateTimeFieldOptions, type OrigamiDateFieldState, type OrigamiDateFieldPart, type OrigamiDateFieldSegmentType } from '@loozo/origami-ui/date-field';
import { OrigamiMenuOptions, OrigamiMenuTriggerOptions, OrigamiMenuContentOptions, OrigamiMenuItemOptions, OrigamiMenuCheckboxItemOptions, OrigamiMenuRadioGroupOptions, OrigamiMenuRadioItemOptions, OrigamiMenuLinkOptions, OrigamiMenuGroupLabelOptions, OrigamiMenuSubOptions, OrigamiMenuSubTriggerOptions, type OrigamiMenuState, type OrigamiMenuItemState, type OrigamiMenuCheckboxItemState, type OrigamiMenuRadioItemState } from '@loozo/origami-ui/menu';
import type { OrigamiPopoverSide, OrigamiPopoverAlign } from '@loozo/origami-ui/popover';
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
// @ts-expect-error Toggle checked must be writable
OrigamiToggleOptions.provideFactory(() => ({checked: computed(() => false), disabled: signal(false), focusableWhenDisabled: signal(false), id: signal('bold')}));
// @ts-expect-error Toggle checked must be a boolean signal
OrigamiToggleOptions.provideFactory(() => ({checked: signal('pressed'), disabled: signal(false), focusableWhenDisabled: signal(false), id: signal('bold')}));
// @ts-expect-error a Toggle factory must supply disabled
OrigamiToggleOptions.provideFactory(() => ({checked: signal(false), focusableWhenDisabled: signal(false), id: signal('bold')}));
// @ts-expect-error a Toggle factory must supply focusableWhenDisabled
OrigamiToggleOptions.provideFactory(() => ({checked: signal(false), disabled: signal(false), id: signal('bold')}));
// @ts-expect-error a Toggle factory must supply id
OrigamiToggleOptions.provideFactory(() => ({checked: signal(false), disabled: signal(false), focusableWhenDisabled: signal(false)}));
// @ts-expect-error Toggle Options have no pressed alias
OrigamiToggleOptions.provideFactory(() => ({pressed: signal(false), disabled: signal(false), focusableWhenDisabled: signal(false), id: signal('bold')}));
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
OrigamiToggleGroupItemOptions.provideFactory(() => ({value: signal('bold'), focusableWhenDisabled: signal(false), id: signal('bold')}));
// @ts-expect-error a ToggleGroup Item factory must supply focusableWhenDisabled
OrigamiToggleGroupItemOptions.provideFactory(() => ({value: signal('bold'), disabled: signal(false), id: signal('bold')}));
// @ts-expect-error a ToggleGroup Item factory must supply id
OrigamiToggleGroupItemOptions.provideFactory(() => ({value: signal('bold'), disabled: signal(false), focusableWhenDisabled: signal(false)}));
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
declare const fieldState: OrigamiFieldState;
// @ts-expect-error Field State errorsShown is readonly
fieldState.errorsShown.set(true);
// @ts-expect-error Field State invalid is readonly
fieldState.invalid.set(true);
// @ts-expect-error Field State errors is a readonly array
fieldState.errors().push({kind: 'required'});
// @ts-expect-error Field State has no readonly signal
void fieldState.readonly;
// @ts-expect-error the Field root has no inputs, so no Options token
void fieldEntry.OrigamiFieldOptions;
// @ts-expect-error a Field Label id must be a string signal
OrigamiFieldLabelOptions.provideFactory(() => ({id: signal(1)}));
// @ts-expect-error a Field Control factory must supply id
OrigamiFieldControlOptions.provideFactory(() => ({}));
// @ts-expect-error Checkbox checked must be writable
OrigamiCheckboxOptions.provideFactory(() => ({checked: computed(() => false), disabled: signal(false), focusableWhenDisabled: signal(false), id: signal('terms')}));
// @ts-expect-error a Checkbox factory must supply id
OrigamiCheckboxOptions.provideFactory(() => ({checked: signal(false), disabled: signal(false), focusableWhenDisabled: signal(false)}));
// @ts-expect-error Switch checked must be a boolean signal
OrigamiSwitchOptions.provideFactory(() => ({checked: signal('on'), disabled: signal(false), focusableWhenDisabled: signal(false), id: signal('notify')}));
// @ts-expect-error a Switch factory must supply focusableWhenDisabled
OrigamiSwitchOptions.provideFactory(() => ({checked: signal(false), disabled: signal(false), id: signal('notify')}));
declare const checkboxState: OrigamiCheckboxState;
// @ts-expect-error Checkbox State checked is readonly
checkboxState.checked.set(true);
// @ts-expect-error Checkbox State has no form state
void checkboxState.invalid;
declare const switchState: OrigamiSwitchState;
// @ts-expect-error Switch State disabled is readonly
switchState.disabled.set(true);
// @ts-expect-error Switch State has no touch event
void switchState.touch;
// @ts-expect-error Dialog open must be writable
OrigamiDialogOptions.provideFactory(() => ({open: computed(() => false), dismissible: signal(true)}));
// @ts-expect-error a Dialog factory must supply dismissible
OrigamiDialogOptions.provideFactory(() => ({open: signal(false)}));
// @ts-expect-error AlertDialog open must be writable
OrigamiAlertDialogOptions.provideFactory(() => ({open: computed(() => false), dismissible: signal(true)}));
// @ts-expect-error an AlertDialog factory must supply dismissible
OrigamiAlertDialogOptions.provideFactory(() => ({open: signal(false)}));
// @ts-expect-error Dialog Content returnFocus is an element or null
OrigamiDialogContentOptions.provideFactory(() => ({id: signal('filters'), returnFocus: signal('trigger')}));
// @ts-expect-error a Dialog Content factory must supply returnFocus
OrigamiDialogContentOptions.provideFactory(() => ({id: signal('filters')}));
// @ts-expect-error a Dialog Close factory must supply focusableWhenDisabled
OrigamiDialogCloseOptions.provideFactory(() => ({disabled: signal(false)}));
type OpenedCriteria = { query: string };
class OpenedDialog {
  readonly criteria = input.required<OpenedCriteria>();
  readonly limit = input(10);
  readonly dense = input(false, { transform: booleanAttribute });
  readonly page = model(0);
  readonly size = input.required<number>({ alias: 'pageSize' });
  readonly search = output<OpenedCriteria>();
  readonly cleared = output<void>();
  readonly plain = 5;
  readonly derived = signal(1);
}
export const openedBindings: OrigamiDialogBindings<OpenedDialog> = { criteria: () => ({query: ''}), limit: signal(3), dense: () => 'true', page: signal(1), size: () => 25, search: (criteria) => void criteria.query.toUpperCase(), cleared: () => undefined };
export const oneWayPage: OrigamiDialogBindings<OpenedDialog> = { page: () => 3 };
export const requiredLeftOut: OrigamiDialogBindings<OpenedDialog> = {};
export function openOpened(): OrigamiDialogRef { return injectOrigamiDialogOpener(OpenedDialog).open({ criteria: () => ({query: 'INV-1'}), size: () => 25 }); }
export async function awaitOpened(ref: OrigamiDialogRef): Promise<void> { ref.close(); const done: Promise<void> = ref.closed; await done; }
declare const openedOpener: OrigamiDialogOpener<OpenedDialog>;
// @ts-expect-error a bound input's getter returns the input's type
export const wrongInputValue: OrigamiDialogBindings<OpenedDialog> = { criteria: () => 42 };
// @ts-expect-error a model's writable signal has the model's type
export const wrongModelSignal: OrigamiDialogBindings<OpenedDialog> = { page: signal('first') };
// @ts-expect-error an output listener takes the output's payload type
export const wrongPayload: OrigamiDialogBindings<OpenedDialog> = { search: (criteria: number) => void criteria };
// @ts-expect-error a plain field is not bindable
export const plainNotBindable: OrigamiDialogBindings<OpenedDialog> = { plain: () => 5 };
// @ts-expect-error a plain signal is not an input
export const signalNotBindable: OrigamiDialogBindings<OpenedDialog> = { derived: () => 1 };
// @ts-expect-error an aliased input binds by property name, not by alias
export const aliasNotKey: OrigamiDialogBindings<OpenedDialog> = { pageSize: () => 25 };
// @ts-expect-error open() checks the record against the component
openedOpener.open({ limit: () => 'ten' });
declare const openedRef: OrigamiDialogRef;
// @ts-expect-error closed is readonly
openedRef.closed = Promise.resolve();
declare const dialogState: OrigamiDialogState;
// @ts-expect-error Dialog State open is readonly
dialogState.open.set(true);
declare const dialogContentState: OrigamiDialogContentState;
// @ts-expect-error Dialog Content State has no public Presence phase alias
void dialogContentState.phase;
// @ts-expect-error Select value must be writable
OrigamiSelectOptions.provideFactory(() => ({value: computed<number | null>(() => null), open: signal(false), disabled: signal(false)}));
// @ts-expect-error Select value is a nullable string, number or boolean
OrigamiSelectOptions.provideFactory(() => ({value: signal<{id: number} | null>(null), open: signal(false), disabled: signal(false)}));
// @ts-expect-error a Select factory must supply open
OrigamiSelectOptions.provideFactory(() => ({value: signal<number | null>(null), disabled: signal(false)}));
// @ts-expect-error a Select Option factory must supply label
OrigamiSelectOptionOptions.provideFactory(() => ({value: signal(1), disabled: signal(false), id: signal('one')}));
// @ts-expect-error a Select Content factory must supply gap
OrigamiSelectContentOptions.provideFactory(() => ({id: signal('list'), side: signal<OrigamiPopoverSide>('block-end'), align: signal<OrigamiPopoverAlign>('start')}));
declare const selectState: OrigamiSelectState<number>;
// @ts-expect-error Select State value is readonly
selectState.value.set(1);
// @ts-expect-error a number Select's value isn't a string
const selectString: string | null = selectState.value();
void selectString;
const selectRecord: OrigamiSelectOptionRecord<number> | null = selectState.selectedOption();
// @ts-expect-error a number Select's record value isn't a string
const selectRecordValue: string | undefined = selectRecord?.value;
void selectRecordValue;
// @ts-expect-error multiple Select value must be writable
OrigamiSelectMultipleOptions.provideFactory(() => ({value: computed<readonly number[]>(() => []), open: signal(false), disabled: signal(false)}));
// @ts-expect-error multiple Select value is an array, not a nullable value
OrigamiSelectMultipleOptions.provideFactory(() => ({value: signal<number | null>(null), open: signal(false), disabled: signal(false)}));
// @ts-expect-error multiple Select values are strings, numbers or booleans
OrigamiSelectMultipleOptions.provideFactory(() => ({value: signal<readonly {id: number}[]>([]), open: signal(false), disabled: signal(false)}));
// @ts-expect-error a multiple Select factory must supply open
OrigamiSelectMultipleOptions.provideFactory(() => ({value: signal<readonly number[]>([]), disabled: signal(false)}));
declare const selectMultipleState: OrigamiSelectMultipleState<number>;
// @ts-expect-error multiple Select State value is readonly
selectMultipleState.value.set([1]);
// @ts-expect-error a number multiple Select's values aren't strings
const selectStrings: readonly string[] = selectMultipleState.value();
void selectStrings;
const selectRecords: readonly OrigamiSelectOptionRecord<number>[] = selectMultipleState.selectedOptions();
// @ts-expect-error a number multiple Select's record values aren't strings
const selectRecordStrings: readonly OrigamiSelectOptionRecord<string>[] = selectMultipleState.selectedOptions();
void selectRecords;
void selectRecordStrings;
declare const selectOptionState: OrigamiSelectOptionState;
// @ts-expect-error Select Option State is readonly
selectOptionState.selected.set(true);
// Positive: a whole Calendar factory, with ordinary signals and readonly bounds.
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: computed<string | null>(() => '2026-01-01'), maxDate: signal<string | null>(null), dateDisabled: signal((date: string) => date.endsWith('-13')), weekStart: signal<1 | 2 | 3 | 4 | 5 | 6 | 7 | null>(7), locale: signal('en-GB'), today: signal('2026-10-27'), fixedWeeks: signal(true), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error Calendar value must be writable
OrigamiCalendarOptions.provideFactory(() => ({value: computed<string | null>(() => null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error Calendar value is a string day, never a Date
OrigamiCalendarOptions.provideFactory(() => ({value: signal<Date | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error Calendar month must be writable
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: computed<string | null>(() => null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error Calendar week start is an ISO weekday from 1 to 7
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(0), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error a Calendar factory must supply maxDate
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error Calendar bounds are minDate and maxDate, not Signal Forms' min and max
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), min: signal<string | null>(null), max: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
OrigamiCalendarCellOptions.provideFactory(() => ({date: input.required<string>()}));
// @ts-expect-error Calendar Cell date is a string
OrigamiCalendarCellOptions.provideFactory(() => ({date: signal(27)}));
OrigamiCalendarHeadingOptions.provideFactory(() => ({id: computed(() => 'heading')}));
// @ts-expect-error a Calendar Heading factory must supply id
OrigamiCalendarHeadingOptions.provideFactory(() => ({}));
declare const calendarState: OrigamiCalendarState;
// @ts-expect-error Calendar State value is readonly
calendarState.value.set('2026-10-27');
// @ts-expect-error Calendar State month is readonly
calendarState.month.set('2026-11');
const calendarMonth: string = calendarState.month();
void calendarMonth;
const calendarDay: OrigamiCalendarDayRecord | undefined = calendarState.weeks()[0]?.[0];
// @ts-expect-error a day record is readonly
calendarDay!.outside = true;
const calendarView: 'days' | 'months' | 'years' = calendarState.view();
const calendarPeriod: OrigamiCalendarPeriodRecord | undefined = calendarState.months()[0]?.[0] ?? calendarState.years()[0]?.[0];
void calendarView;
// @ts-expect-error Calendar period records are readonly
calendarPeriod!.label = 'Oct';
// @ts-expect-error Calendar State view is readonly
calendarState.view.set('months');
// @ts-expect-error Calendar view must be writable
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: computed<'days' | 'months' | 'years'>(() => 'days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error Calendar view is days, months or years
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'weeks'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error a Calendar factory must supply columns
OrigamiCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), disabled: signal(false), readonly: signal(false)}));
// Positive: a whole month Calendar factory, with ordinary signals and readonly bounds.
OrigamiMonthCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'months' | 'years'>('months'), minMonth: computed<string | null>(() => '2026-03'), maxMonth: signal<string | null>(null), monthDisabled: signal((month: string) => month.endsWith('-07')), locale: signal('en-GB'), today: signal('2026-10-27'), columns: signal(4), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error a month Calendar has no days view
OrigamiMonthCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('months'), minMonth: signal<string | null>(null), maxMonth: signal<string | null>(null), monthDisabled: signal(() => false), locale: signal('en-US'), today: signal('2026-10-27'), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error month Calendar bounds are minMonth and maxMonth, not Signal Forms' min and max
OrigamiMonthCalendarOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'months' | 'years'>('months'), min: signal<string | null>(null), max: signal<string | null>(null), monthDisabled: signal(() => false), locale: signal('en-US'), today: signal('2026-10-27'), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error month Calendar value must be writable
OrigamiMonthCalendarOptions.provideFactory(() => ({value: computed<string | null>(() => null), month: signal<string | null>(null), view: signal<'months' | 'years'>('months'), minMonth: signal<string | null>(null), maxMonth: signal<string | null>(null), monthDisabled: signal(() => false), locale: signal('en-US'), today: signal('2026-10-27'), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// Positive: a whole date field factory, with ordinary signals.
OrigamiDateFieldOptions.provideFactory(() => ({value: signal<string | null>(null), locale: signal('en-GB'), disabled: computed(() => false), readonly: signal(false)}));
// @ts-expect-error date field value must be writable
OrigamiDateFieldOptions.provideFactory(() => ({value: computed<string | null>(() => null), locale: signal('en-US'), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error date field value is a string day, never a Date
OrigamiDateFieldOptions.provideFactory(() => ({value: signal<Date | null>(null), locale: signal('en-US'), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error a date field factory must supply readonly
OrigamiDateFieldOptions.provideFactory(() => ({value: signal<string | null>(null), locale: signal('en-US'), disabled: signal(false)}));
OrigamiDateFieldSegmentOptions.provideFactory(() => ({segment: input.required<OrigamiDateFieldSegmentType>(), placeholder: signal<string | null>('dd')}));
// @ts-expect-error a date field segment is a unit, not any string
OrigamiDateFieldSegmentOptions.provideFactory(() => ({segment: signal('week'), placeholder: signal<string | null>(null)}));
// @ts-expect-error a date field segment factory must supply placeholder
OrigamiDateFieldSegmentOptions.provideFactory(() => ({segment: signal<OrigamiDateFieldSegmentType>('day')}));
// Positive: a whole time field factory, with ordinary signals.
OrigamiTimeFieldOptions.provideFactory(() => ({value: signal<string | null>('09:30'), locale: signal('en-GB'), precision: signal<'minute' | 'second'>('second'), hourCycle: signal<12 | 24 | null>(null), disabled: computed(() => false), readonly: signal(false)}));
// @ts-expect-error time field value must be writable
OrigamiTimeFieldOptions.provideFactory(() => ({value: computed<string | null>(() => null), locale: signal('en-US'), precision: signal<'minute' | 'second'>('minute'), hourCycle: signal<12 | 24 | null>(null), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error time field precision is minute or second, not any string
OrigamiTimeFieldOptions.provideFactory(() => ({value: signal<string | null>(null), locale: signal('en-US'), precision: signal('hour'), hourCycle: signal<12 | 24 | null>(null), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error time field hour cycle is 12, 24 or null, not any number
OrigamiTimeFieldOptions.provideFactory(() => ({value: signal<string | null>(null), locale: signal('en-US'), precision: signal<'minute' | 'second'>('minute'), hourCycle: signal<number | null>(11), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error a time field factory must supply hourCycle
OrigamiTimeFieldOptions.provideFactory(() => ({value: signal<string | null>(null), locale: signal('en-US'), precision: signal<'minute' | 'second'>('minute'), disabled: signal(false), readonly: signal(false)}));
// Positive: a whole date-time field factory, with ordinary signals.
OrigamiDateTimeFieldOptions.provideFactory(() => ({value: signal<string | null>('2026-10-27T09:30'), locale: signal('en-GB'), precision: signal<'minute' | 'second'>('second'), hourCycle: signal<12 | 24 | null>(null), disabled: computed(() => false), readonly: signal(false)}));
// @ts-expect-error date-time field value must be writable
OrigamiDateTimeFieldOptions.provideFactory(() => ({value: computed<string | null>(() => null), locale: signal('en-US'), precision: signal<'minute' | 'second'>('minute'), hourCycle: signal<12 | 24 | null>(null), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error date-time field precision is minute or second, not any string
OrigamiDateTimeFieldOptions.provideFactory(() => ({value: signal<string | null>(null), locale: signal('en-US'), precision: signal('day'), hourCycle: signal<12 | 24 | null>(null), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error a date-time field factory must supply hourCycle
OrigamiDateTimeFieldOptions.provideFactory(() => ({value: signal<string | null>(null), locale: signal('en-US'), precision: signal<'minute' | 'second'>('minute'), disabled: signal(false), readonly: signal(false)}));
declare const dateFieldState: OrigamiDateFieldState;
// @ts-expect-error date field State value is readonly
dateFieldState.value.set('2026-10-27');
const dateFieldPart: OrigamiDateFieldPart | undefined = dateFieldState.segments()[0];
// @ts-expect-error date field parts are readonly
dateFieldPart!.text = '27';
const dateFieldErrorKind: string | undefined = dateFieldState.parseErrors()[0]?.kind;
void dateFieldErrorKind;
// Positive: whole Menu factories, with ordinary signals.
OrigamiMenuOptions.provideFactory(() => ({open: signal(false), disabled: computed(() => false)}));
OrigamiMenuTriggerOptions.provideFactory(() => ({id: signal('actions'), disabled: signal(false), focusableWhenDisabled: signal(false)}));
OrigamiMenuItemOptions.provideFactory(() => ({disabled: signal(false), label: signal<string | null>('Delete')}));
OrigamiMenuLinkOptions.provideFactory(() => ({label: signal<string | null>(null)}));
OrigamiMenuGroupLabelOptions.provideFactory(() => ({id: signal('sort-label')}));
// @ts-expect-error Menu open must be writable
OrigamiMenuOptions.provideFactory(() => ({open: computed(() => false), disabled: signal(false)}));
// @ts-expect-error a Menu factory must supply disabled
OrigamiMenuOptions.provideFactory(() => ({open: signal(false)}));
// @ts-expect-error a Menu Content factory must supply gap
OrigamiMenuContentOptions.provideFactory(() => ({id: signal('menu'), side: signal<OrigamiPopoverSide>('block-end'), align: signal<OrigamiPopoverAlign>('start')}));
// @ts-expect-error a Menu item factory must supply label
OrigamiMenuItemOptions.provideFactory(() => ({disabled: signal(false)}));
// @ts-expect-error a Menu link has no disabled; its label is a string or null
OrigamiMenuLinkOptions.provideFactory(() => ({label: signal(false)}));
declare const menuState: OrigamiMenuState;
// @ts-expect-error Menu State open is readonly
menuState.open.set(true);
declare const menuItemState: OrigamiMenuItemState;
// @ts-expect-error Menu item State disabled is readonly
menuItemState.disabled.set(true);
menuItemState.select.subscribe(() => {});
// Positive: whole checkable factories, with ordinary signals.
OrigamiMenuCheckboxItemOptions.provideFactory(() => ({checked: signal(false), disabled: signal(false), label: signal<string | null>(null)}));
OrigamiMenuRadioGroupOptions.provideFactory(() => ({value: signal<string | null>('compact')}));
OrigamiMenuRadioItemOptions.provideFactory(() => ({value: signal('compact'), disabled: computed(() => false), label: signal<string | null>('Compact')}));
// @ts-expect-error a Menu checkbox item's checked must be writable
OrigamiMenuCheckboxItemOptions.provideFactory(() => ({checked: computed(() => false), disabled: signal(false), label: signal<string | null>(null)}));
// @ts-expect-error a Menu checkbox item factory must supply label
OrigamiMenuCheckboxItemOptions.provideFactory(() => ({checked: signal(false), disabled: signal(false)}));
// @ts-expect-error a Menu radio group's value must be writable
OrigamiMenuRadioGroupOptions.provideFactory(() => ({value: computed<string | null>(() => null)}));
// @ts-expect-error a Menu radio group's value is a string or null
OrigamiMenuRadioGroupOptions.provideFactory(() => ({value: signal<number | null>(1)}));
// @ts-expect-error a Menu radio item's value is a string
OrigamiMenuRadioItemOptions.provideFactory(() => ({value: signal<string | null>(null), disabled: signal(false), label: signal<string | null>(null)}));
declare const menuCheckboxItemState: OrigamiMenuCheckboxItemState;
// @ts-expect-error Menu checkbox item State checked is readonly
menuCheckboxItemState.checked.set(true);
menuCheckboxItemState.select.subscribe(() => {});
declare const menuRadioItemState: OrigamiMenuRadioItemState;
const menuRadioChecked: boolean = menuRadioItemState.checked();
void menuRadioChecked;
// @ts-expect-error Menu radio item State disabled is readonly
menuRadioItemState.disabled.set(true);
// Positive: whole submenu factories, with ordinary signals.
OrigamiMenuSubOptions.provideFactory(() => ({open: signal(false), disabled: computed(() => false)}));
OrigamiMenuSubTriggerOptions.provideFactory(() => ({id: signal('move'), disabled: signal(false), label: signal<string | null>('Move')}));
// @ts-expect-error a Menu Sub's open must be writable
OrigamiMenuSubOptions.provideFactory(() => ({open: computed(() => false), disabled: signal(false)}));
// @ts-expect-error a Menu sub-trigger factory must supply label
OrigamiMenuSubTriggerOptions.provideFactory(() => ({id: signal('move'), disabled: signal(false)}));
// @ts-expect-error a Menu sub-trigger's label is a string or null
OrigamiMenuSubTriggerOptions.provideFactory(() => ({id: signal('move'), disabled: signal(false), label: signal(false)}));
declare const monthCalendarState: OrigamiMonthCalendarState;
const monthCalendarView: 'months' | 'years' = monthCalendarState.view();
const monthCalendarValue: string | null = monthCalendarState.value();
void monthCalendarView;
void monthCalendarValue;
// @ts-expect-error month Calendar State value is readonly
monthCalendarState.value.set('2026-10');
// @ts-expect-error month Calendar State has no weeks
void monthCalendarState.weeks;
// Positive: whole multiple and range Calendar factories.
OrigamiCalendarMultipleOptions.provideFactory(() => ({value: signal<readonly string[]>([]), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
OrigamiCalendarRangeOptions.provideFactory(() => ({value: signal<OrigamiDateRange | null>({ start: '2026-10-01', end: '2026-10-05' }), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error multiple Calendar value is an array of days, not one day
OrigamiCalendarMultipleOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error multiple Calendar value must be writable
OrigamiCalendarMultipleOptions.provideFactory(() => ({value: computed<readonly string[]>(() => []), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error range Calendar value is a range, not one day
OrigamiCalendarRangeOptions.provideFactory(() => ({value: signal<string | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false), readonly: signal(false)}));
// @ts-expect-error a range has both ends
const halfRange: OrigamiDateRange = { start: '2026-10-01' };
void halfRange;
// @ts-expect-error a range Calendar factory must supply readonly
OrigamiCalendarRangeOptions.provideFactory(() => ({value: signal<OrigamiDateRange | null>(null), month: signal<string | null>(null), view: signal<'days' | 'months' | 'years'>('days'), minDate: signal<string | null>(null), maxDate: signal<string | null>(null), dateDisabled: signal(() => false), weekStart: signal(null), locale: signal('en-US'), today: signal('2026-10-27'), fixedWeeks: signal(false), columns: signal(3), disabled: signal(false)}));
declare const calendarMultipleState: OrigamiCalendarMultipleState;
const calendarDays: readonly string[] = calendarMultipleState.value();
void calendarDays;
// @ts-expect-error multiple Calendar State value is readonly
calendarMultipleState.value.set([]);
declare const calendarRangeState: OrigamiCalendarRangeState;
const calendarRange: OrigamiDateRange | null = calendarRangeState.value();
const calendarAnchor: string | null = calendarRangeState.anchor();
void calendarRange;
void calendarAnchor;
// @ts-expect-error range Calendar State anchor is readonly
calendarRangeState.anchor.set(null);
// @ts-expect-error a range is readonly
calendarRange!.start = '2026-10-01';
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
class WrongToggle { readonly checked = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); readonly id = signal('bold'); }
class WrongTabsTrigger { readonly value = signal(1); readonly id = signal('tab'); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); }
class WrongAccordionItem { readonly value = signal('billing'); readonly disabled = signal('no'); readonly hiding = signal<OrigamiCollapsibleHiding>('hidden'); }
class WrongToggleGroupItem { readonly value = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); readonly id = signal('bold'); }
class WrongButton { readonly disabled = signal(false); readonly focusableWhenDisabled = signal('no'); }
class WrongRadioGroupItem { readonly value = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); }
class WrongBooleanControl { readonly checked = signal(1); readonly disabled = signal(false); readonly focusableWhenDisabled = signal(false); readonly id = signal('terms'); }
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
// @ts-expect-error incompatible existing Checkbox class
OrigamiCheckboxOptions.provideExisting(() => WrongBooleanControl);
// @ts-expect-error incompatible existing Switch class
OrigamiSwitchOptions.provideExisting(() => WrongBooleanControl);
// @ts-expect-error incompatible existing AlertDialog class
OrigamiAlertDialogOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Select Trigger class
OrigamiSelectTriggerOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Dialog Title class
OrigamiDialogTitleOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Dialog Trigger class
OrigamiDialogTriggerOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Field Description class
OrigamiFieldDescriptionOptions.provideExisting(() => WrongIdentity);
// @ts-expect-error incompatible existing Field Error class
OrigamiFieldErrorOptions.provideExisting(() => WrongIdentity);
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
  abstract readonly checked: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
  abstract readonly id: Signal<string>;
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
  abstract readonly id: Signal<string>;
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
abstract class AbstractBooleanControl {
  abstract readonly checked: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly focusableWhenDisabled: Signal<boolean>;
  abstract readonly id: Signal<string>;
}
abstract class AbstractSelect {
  abstract readonly value: WritableSignal<boolean | null>;
  abstract readonly open: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
}
abstract class AbstractSelectMultiple {
  abstract readonly value: WritableSignal<readonly string[]>;
  abstract readonly open: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
}
abstract class AbstractSelectOption {
  abstract readonly value: Signal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly label: Signal<string | null>;
  abstract readonly id: Signal<string>;
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
  OrigamiToggleOptions.provideFactory(() => ({checked: signal(false), disabled: computed(() => false), focusableWhenDisabled: signal(false), id: computed(() => 'bold')})),
  OrigamiToggleOptions.provideExisting(() => AbstractToggle),
  OrigamiTabsOptions.provideFactory(() => ({value: signal<string | null>('billing'), disabled: computed(() => false), orientation: signal<OrigamiTabsOrientation>('vertical'), activation: signal<OrigamiTabsActivation>('manual')})),
  OrigamiTabsOptions.provideExisting(() => AbstractTabs),
  OrigamiTabsTriggerOptions.provideFactory(() => ({value: signal('billing'), id: signal('billing-tab'), disabled: computed(() => false), focusableWhenDisabled: signal(false)})),
  OrigamiTabsPanelOptions.provideFactory(() => ({value: signal('billing'), id: signal('billing-panel')})),
  OrigamiTabsPanelOptions.provideExisting(() => AbstractTabsPart),
  OrigamiToggleGroupSingleOptions.provideFactory(() => ({value: signal<string | null>('start'), disabled: computed(() => false), orientation: signal<OrigamiToggleGroupOrientation>('vertical'), deselectable: signal(true)})),
  OrigamiToggleGroupSingleOptions.provideExisting(() => AbstractToggleGroupSingle),
  OrigamiToggleGroupMultipleOptions.provideFactory(() => ({value: signal<readonly string[]>(['bold']), disabled: signal(false), orientation: signal<OrigamiToggleGroupOrientation>('horizontal')})),
  OrigamiToggleGroupItemOptions.provideFactory(() => ({value: signal('bold'), disabled: computed(() => false), focusableWhenDisabled: signal(false), id: computed(() => 'bold')})),
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
  OrigamiFieldLabelOptions.provideFactory(() => ({id: computed(() => 'email-label')})),
  OrigamiFieldLabelOptions.provideExisting(() => AbstractIdentity),
  OrigamiFieldControlOptions.provideFactory(() => ({id: signal('email')})),
  OrigamiFieldControlOptions.provideExisting(() => AbstractIdentity),
  OrigamiFieldDescriptionOptions.provideFactory(() => ({id: signal('email-hint')})),
  OrigamiFieldDescriptionOptions.provideExisting(() => AbstractIdentity),
  OrigamiFieldErrorOptions.provideFactory(() => ({id: signal('email-error')})),
  OrigamiFieldErrorOptions.provideExisting(() => AbstractIdentity),
  OrigamiCheckboxOptions.provideFactory(() => ({checked: signal(true), disabled: computed(() => false), focusableWhenDisabled: signal(false), id: signal('terms')})),
  OrigamiCheckboxOptions.provideExisting(() => AbstractBooleanControl),
  OrigamiSwitchOptions.provideFactory(() => ({checked: signal(false), disabled: signal(false), focusableWhenDisabled: signal(true), id: computed(() => 'notify')})),
  OrigamiSwitchOptions.provideExisting(() => AbstractBooleanControl),
  OrigamiSelectOptions.provideFactory(() => ({value: signal<number | null>(null), open: signal(false), disabled: computed(() => false)})),
  OrigamiSelectOptions.provideFactory(() => ({value: signal<string | null>('s'), open: signal(false), disabled: signal(false)})),
  OrigamiSelectOptions.provideExisting(() => AbstractSelect),
  OrigamiSelectMultipleOptions.provideFactory(() => ({value: signal<readonly number[]>([1, 2]), open: signal(false), disabled: computed(() => false)})),
  OrigamiSelectMultipleOptions.provideExisting(() => AbstractSelectMultiple),
  OrigamiSelectTriggerOptions.provideFactory(() => ({id: signal('country'), disabled: computed(() => false), focusableWhenDisabled: signal(false)})),
  OrigamiSelectTriggerOptions.provideExisting(() => AbstractPopoverTrigger),
  OrigamiSelectContentOptions.provideFactory(() => ({id: signal('countries'), side: signal<OrigamiPopoverSide>('block-end'), align: signal<OrigamiPopoverAlign>('start'), gap: signal(4)})),
  OrigamiSelectOptionOptions.provideFactory(() => ({value: signal(1), disabled: signal(false), label: signal<string | null>('One'), id: signal('one')})),
  OrigamiSelectOptionOptions.provideExisting(() => AbstractSelectOption),
  OrigamiDialogOptions.provideFactory(() => ({open: signal(false), dismissible: computed(() => true)})),
  OrigamiAlertDialogOptions.provideFactory(() => ({open: signal(false), dismissible: computed(() => false)})),
  OrigamiDialogTriggerOptions.provideFactory(() => ({id: signal('filters-trigger'), disabled: computed(() => false), focusableWhenDisabled: signal(false)})),
  OrigamiDialogContentOptions.provideFactory(() => ({id: signal('filters'), returnFocus: signal<HTMLElement | null>(null)})),
  OrigamiDialogTitleOptions.provideFactory(() => ({id: signal('filters-title')})),
  OrigamiDialogTitleOptions.provideExisting(() => AbstractIdentity),
  OrigamiDialogDescriptionOptions.provideFactory(() => ({id: computed(() => 'filters-description')})),
  OrigamiDialogDescriptionOptions.provideExisting(() => AbstractIdentity),
  OrigamiDialogCloseOptions.provideFactory(() => ({disabled: signal(false), focusableWhenDisabled: signal(true)})),
  OrigamiDialogCloseOptions.provideExisting(() => AbstractButton),
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
    imports: `import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiToggle, OrigamiToggleState } from "@loozo/origami-ui/toggle";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";`,
    directives: "FormField, OrigamiToggle, OrigamiField, OrigamiFieldLabel",
    members: `
  readonly checked = signal(false);
  readonly wrongChecked = signal("pressed");
  readonly model = signal({ bold: false });
  readonly form = form(this.model, (path) => { required(path.bold); });
  checkedOutput(value: boolean): void { void value; }
  touched(): void {}
  wrongOutput(value: string): void { void value; }
  observeToggle(state: OrigamiToggleState): void { void state; }`,
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
    imports: `import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiToggleGroupSingle, OrigamiToggleGroupMultiple, OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";`,
    directives:
      "FormField, OrigamiToggleGroupSingle, OrigamiToggleGroupMultiple, OrigamiToggleGroupItem, OrigamiField, OrigamiFieldLabel",
    members: `
  readonly alignment = signal<string | null>(null);
  readonly marks = signal<readonly string[]>([]);
  readonly model = signal<{ alignment: string | null; marks: string[]; frozen: readonly string[] }>({ alignment: null, marks: [], frozen: [] });
  readonly form = form(this.model, (path) => { required(path.alignment); });
  touched(): void {}
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
  readonly checked = signal(false);
  readonly wrongChecked = signal("pressed");
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
  readonly checked = signal(false);
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
  field: {
    imports: `import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiField, OrigamiFieldLabel, OrigamiFieldControl, OrigamiFieldDescription, OrigamiFieldError, OrigamiFieldState } from "@loozo/origami-ui/field";`,
    directives:
      "FormField, OrigamiField, OrigamiFieldLabel, OrigamiFieldControl, OrigamiFieldDescription, OrigamiFieldError",
    members: `
  readonly model = signal({ email: "" });
  readonly form = form(this.model, (path) => { required(path.email); });
  observeField(state: OrigamiFieldState): void { void state; }
  observeString(value: string): void { void value; }`,
  },
  "boolean-controls": {
    imports: `import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiCheckbox, OrigamiCheckboxState } from "@loozo/origami-ui/checkbox";
import { OrigamiSwitch, OrigamiSwitchState } from "@loozo/origami-ui/switch";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";`,
    directives: "FormField, OrigamiCheckbox, OrigamiSwitch, OrigamiField, OrigamiFieldLabel",
    members: `
  readonly checked = signal(false);
  readonly wrongChecked = signal("yes");
  readonly model = signal({ terms: false, notify: true });
  readonly form = form(this.model, (path) => { required(path.terms); });
  checkedOutput(value: boolean): void { void value; }
  touched(): void {}
  wrongOutput(value: string): void { void value; }
  observeCheckbox(state: OrigamiCheckboxState): void { void state; }
  observeSwitch(state: OrigamiSwitchState): void { void state; }
  observeString(value: string): void { void value; }`,
  },
  dialog: {
    imports: `import { OrigamiDialog, OrigamiAlertDialog, OrigamiDialogTrigger, OrigamiDialogContent, OrigamiDialogTitle, OrigamiDialogDescription, OrigamiDialogClose, OrigamiDialogState, OrigamiDialogContentState } from "@loozo/origami-ui/dialog";`,
    directives:
      "OrigamiDialog, OrigamiAlertDialog, OrigamiDialogTrigger, OrigamiDialogContent, OrigamiDialogTitle, OrigamiDialogDescription, OrigamiDialogClose",
    members: `
  readonly open = signal(false);
  readonly wrongOpen = signal("yes");
  openOutput(value: boolean): void { void value; }
  observeDialog(state: OrigamiDialogState): void { void state; }
  observeContent(state: OrigamiDialogContentState): void { void state; }
  observeString(value: string): void { void value; }`,
  },
  select: {
    imports: `import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiSelect, OrigamiSelectMultiple, OrigamiSelectTrigger, OrigamiSelectContent, OrigamiSelectOption, OrigamiSelectOptionState, type OrigamiSelectOptionRecord } from "@loozo/origami-ui/select";
import { OrigamiField, OrigamiFieldLabel, OrigamiFieldDescription } from "@loozo/origami-ui/field";`,
    directives:
      "FormField, OrigamiSelect, OrigamiSelectMultiple, OrigamiSelectTrigger, OrigamiSelectContent, OrigamiSelectOption, OrigamiField, OrigamiFieldLabel, OrigamiFieldDescription",
    members: `
  readonly model = signal<{ priority: number | null; agree: boolean | null; size: string | null; shape: { id: number } | null; tags: string[]; ids: number[]; flags: boolean[] }>({ priority: null, agree: null, size: null, shape: null, tags: [], ids: [], flags: [] });
  readonly counts = signal<readonly number[]>([]);
  countsOutput(value: readonly number[]): void { void value; }
  tagsOutput(value: readonly string[]): void { void value; }
  flagsOutput(value: readonly boolean[]): void { void value; }
  observeRecords(value: readonly OrigamiSelectOptionRecord<number>[]): void { void value; }
  readonly form = form(this.model, (path) => { required(path.priority); });
  touched(): void {}
  readonly count = signal<number | null>(null);
  readonly agree = signal<boolean | null>(null);
  readonly size = signal<string | null>("m");
  readonly shape = signal<{ id: number } | null>(null);
  readonly open = signal(false);
  countOutput(value: number | null): void { void value; }
  agreeOutput(value: boolean | null): void { void value; }
  stringOutput(value: string | null): void { void value; }
  observeRecord(value: OrigamiSelectOptionRecord<number> | null): void { void value; }
  observeOption(state: OrigamiSelectOptionState): void { void state; }
  observeBoolean(value: boolean): void { void value; }`,
  },
  calendar: {
    imports: `import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiCalendar, OrigamiCalendarMultiple, OrigamiCalendarRange, OrigamiMonthCalendar, OrigamiCalendarGrid, OrigamiCalendarCell, OrigamiCalendarHeading, OrigamiCalendarPrevious, OrigamiCalendarNext, type OrigamiCalendarDayRecord, type OrigamiCalendarPeriodRecord, type OrigamiDateRange } from "@loozo/origami-ui/calendar";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";`,
    directives:
      "FormField, OrigamiCalendar, OrigamiCalendarMultiple, OrigamiCalendarRange, OrigamiMonthCalendar, OrigamiCalendarGrid, OrigamiCalendarCell, OrigamiCalendarHeading, OrigamiCalendarPrevious, OrigamiCalendarNext, OrigamiField, OrigamiFieldLabel",
    members: `
  readonly day = signal<string | null>(null);
  readonly days = signal<readonly string[]>([]);
  readonly period = signal<OrigamiDateRange | null>(null);
  readonly month = signal<string | null>(null);
  readonly view = signal<"days" | "months" | "years">("days");
  readonly monthView = signal<"months" | "years">("months");
  readonly count = signal<number | null>(null);
  readonly model = signal<{ day: string | null; days: readonly string[]; period: OrigamiDateRange | null; count: number | null; start: string | null }>({ day: null, days: [], period: null, count: null, start: null });
  readonly form = form(this.model, (path) => { required(path.day); });
  weekend(date: string): boolean { return date.endsWith("-01"); }
  touched(): void {}
  dayOutput(value: string | null): void { void value; }
  monthOutput(value: string | null): void { void value; }
  countOutput(value: number | null): void { void value; }
  observeMonth(value: string): void { void value; }
  observeWeeks(value: readonly (readonly OrigamiCalendarDayRecord[])[]): void { void value; }
  daysOutput(value: readonly string[]): void { void value; }
  periodOutput(value: OrigamiDateRange | null): void { void value; }
  anchorOutput(value: string | null): void { void value; }
  viewOutput(value: "days" | "months" | "years"): void { void value; }
  monthViewOutput(value: "months" | "years"): void { void value; }
  observePeriods(value: readonly (readonly OrigamiCalendarPeriodRecord[])[]): void { void value; }`,
  },
  "radio-group": {
    imports: `import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import { OrigamiToolbar, OrigamiToolbarItem } from "@loozo/origami-ui/toolbar";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";`,
    directives:
      "FormField, OrigamiRadioGroup, OrigamiRadioGroupItem, OrigamiToolbar, OrigamiToolbarItem, OrigamiField, OrigamiFieldLabel",
    members: `
  readonly speed = signal<string | null>(null);
  readonly model = signal<{ speed: string | null }>({ speed: null });
  readonly form = form(this.model, (path) => { required(path.speed); });
  touched(): void {}
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
    template: `<button ogToggle #bold="ogToggle" [(checked)]="checked" disabled focusableWhenDisabled id="bold" (checkedChange)="checkedOutput($event)" (touch)="touched()" (click)="observeToggle(bold.state)">Valid</button><div ogField><label ogFieldLabel>Bold</label><button ogToggle [formField]="form.bold">B</button></div>`,
  },
  {
    name: "toggle-model",
    family: "toggle",
    template: `<button ogToggle [(checked)]="wrongChecked">Wrong model</button>`,
    expected: {
      code: 2322,
      span: "checked",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "toggle-pressed-removed",
    family: "toggle",
    template: `<button ogToggle [pressed]="true">Removed model</button>`,
    expected: {
      code: -998002,
      span: `[pressed]="true"`,
      message: /Can't bind to 'pressed' since it isn't a known property of 'button'/,
    },
  },
  {
    name: "toggle-form-state-input",
    family: "toggle",
    template: `<button ogToggle [required]="true">Bold</button>`,
    expected: {
      code: -998002,
      span: `[required]="true"`,
      message: /Can't bind to 'required' since it isn't a known property of 'button'/,
    },
  },
  {
    name: "toggle-output",
    family: "toggle",
    template: `<button ogToggle (checkedChange)="wrongOutput($event)">Wrong output</button>`,
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
    template: `<div ogToggleGroupSingle [(value)]="alignment" orientation="vertical" deselectable disabled (valueChange)="alignmentOutput($event)"><button ogToggleGroupItem value="start" disabled>Start</button></div><div ogToggleGroupMultiple [(value)]="marks" (valueChange)="marksOutput($event)"><button ogToggleGroupItem value="bold" id="bold">Bold</button><button ogToggleGroupItem value="italic" [id]="'italic'">Italic</button></div>`,
  },
  {
    name: "toggle-group-form-positive",
    family: "toggle-group",
    template: `<div ogField><span ogFieldLabel>Alignment</span><div ogToggleGroupSingle #alignmentGroup="ogToggleGroupSingle" [formField]="form.alignment" (touch)="touched()" (click)="alignmentGroup.focus({ preventScroll: true })"><button ogToggleGroupItem value="start">Start</button></div></div><div ogField><span ogFieldLabel>Marks</span><div ogToggleGroupMultiple #marksGroup="ogToggleGroupMultiple" [formField]="form.marks" (touch)="touched()" (click)="marksGroup.focus()"><button ogToggleGroupItem value="bold">Bold</button></div></div><div ogToggleGroupMultiple [formField]="form.frozen"></div>`,
  },
  {
    name: "toggle-group-form-model",
    family: "toggle-group",
    template: `<div ogToggleGroupSingle [formField]="form.marks"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /Type 'string\[\]' is not assignable to type 'string'/,
    },
  },
  {
    name: "toggle-group-form-state-input",
    family: "toggle-group",
    template: `<div ogToggleGroupMultiple [required]="true"></div>`,
    expected: {
      code: -998002,
      span: `[required]="true"`,
      message: /Can't bind to 'required' since it isn't a known property of 'div'/,
    },
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
    template: `<div ogToolbar orientation="vertical" aria-label="Editing"><button ogToolbarItem disabled focusableWhenDisabled>Undo</button><button ogToolbarToggle #spelling="ogToolbarToggle" [(checked)]="checked" [disabled]="false" focusableWhenDisabled id="spelling" (click)="observeToggle(spelling.state)">Spell check</button><span ogPopover><button ogToolbarPopoverTrigger id="insert" disabled focusableWhenDisabled>Insert</button></span><div ogToggleGroupMultiple [(value)]="marks"><button ogToggleGroupItem value="bold" focusableWhenDisabled>Bold</button></div></div>`,
  },
  {
    name: "toolbar-toggle-model",
    family: "toolbar",
    template: `<div ogToolbar aria-label="Editing"><button ogToolbarToggle [(checked)]="wrongChecked">Spell check</button></div>`,
    expected: {
      code: 2322,
      span: "checked",
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
    template: `<span ogTooltip #tooltip="ogTooltip" [(open)]="open" disabled [openDelay]="200" (openChange)="openOutput($event)"><button ogButton ogTooltipTrigger [disabled]="true" focusableWhenDisabled aria-label="Save" (click)="observeTooltip(tooltip.state)">S</button><span ogTooltipContent #content="ogTooltipContent" id="hint" side="block-end" align="end" [gap]="6" (click)="observeContent(content.state)">Saves the draft</span></span><span ogTooltip><button ogToggle ogTooltipTrigger [(checked)]="checked" aria-label="Bold">B</button><span ogTooltipContent>Bold text</span></span>`,
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
    template: `<div ogRadioGroup [(value)]="speed" disabled aria-label="Speed" (valueChange)="speedOutput($event)"><button ogRadioGroupItem value="standard" disabled>Standard</button></div><div ogToolbar aria-label="Text"><button ogToolbarItem>Copy</button><div ogRadioGroup [(value)]="speed" aria-label="Alignment"><button ogRadioGroupItem value="left">Left</button></div></div><div ogField><span ogFieldLabel>Speed</span><div ogRadioGroup #speedGroup="ogRadioGroup" [formField]="form.speed" (touch)="touched()" (click)="speedGroup.focus()"><button ogRadioGroupItem value="standard">Standard</button></div></div>`,
  },
  {
    name: "radio-group-form-state-input",
    family: "radio-group",
    template: `<div ogRadioGroup [invalid]="true"></div>`,
    expected: {
      code: -998002,
      span: `[invalid]="true"`,
      message: /Can't bind to 'invalid' since it isn't a known property of 'div'/,
    },
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
    name: "field-positive",
    family: "field",
    template: `<div ogField #field="ogField" (click)="observeField(field.state)"><label ogFieldLabel id="email-label">Email</label><input ogFieldControl id="email" type="email" [formField]="form.email" /><p ogFieldDescription [id]="'email-hint'">Hint</p>@if (field.state.errorsShown()) {<p ogFieldError>{{ field.state.errors()[0]?.message }}</p>}</div>`,
  },
  {
    name: "field-control-id",
    family: "field",
    template: `<div ogField><input ogFieldControl [id]="4" [formField]="form.email" /></div>`,
    expected: {
      code: 2322,
      span: "id",
      message: /Type 'number' is not assignable to type 'string'/,
    },
  },
  {
    name: "field-root-input",
    family: "field",
    template: `<div ogField [disabled]="true"></div>`,
    expected: {
      code: -998002,
      span: `[disabled]="true"`,
      message: /Can't bind to 'disabled' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "field-state",
    family: "field",
    template: `<div ogField #field="ogField" (click)="observeString(field.state)"></div>`,
    expected: {
      code: 2345,
      span: "state",
      message: /'OrigamiFieldState' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "boolean-controls-positive",
    family: "boolean-controls",
    template: `<button ogCheckbox #remember="ogCheckbox" [(checked)]="checked" disabled focusableWhenDisabled id="remember" aria-label="Remember me" (checkedChange)="checkedOutput($event)" (touch)="touched()" (click)="observeCheckbox(remember.state)"></button><div ogField><button ogCheckbox [formField]="form.terms"></button><label ogFieldLabel>Terms</label></div><div ogField><label ogFieldLabel>Notify</label><button ogSwitch #notify="ogSwitch" [formField]="form.notify" (click)="observeSwitch(notify.state)"></button></div>`,
  },
  {
    name: "checkbox-model",
    family: "boolean-controls",
    template: `<button ogCheckbox [(checked)]="wrongChecked"></button>`,
    expected: {
      code: 2322,
      span: "checked",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "switch-output",
    family: "boolean-controls",
    template: `<button ogSwitch (checkedChange)="wrongOutput($event)"></button>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /Argument of type 'boolean' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "checkbox-state",
    family: "boolean-controls",
    template: `<button ogCheckbox #terms="ogCheckbox" (click)="observeString(terms.state)"></button>`,
    expected: {
      code: 2345,
      span: "state",
      message: /'OrigamiCheckboxState' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "checkbox-form-state-input",
    family: "boolean-controls",
    template: `<button ogCheckbox [invalid]="true"></button>`,
    expected: {
      code: -998002,
      span: `[invalid]="true"`,
      message: /Can't bind to 'invalid' since it isn't a known property of 'button'/,
    },
  },
  {
    name: "switch-host",
    family: "boolean-controls",
    template: `<div ogSwitch [checked]="true"></div>`,
    expected: {
      code: -998002,
      span: `[checked]="true"`,
      message: /Can't bind to 'checked' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "dialog-positive",
    family: "dialog",
    template: `<div ogDialog #dialog="ogDialog" [(open)]="open" dismissible (openChange)="openOutput($event)"><button ogDialogTrigger id="filters-trigger" disabled focusableWhenDisabled>Filters</button><dialog ogDialogContent #content="ogDialogContent" [returnFocus]="null" (close)="observeDialog(dialog.state); observeContent(content.state)"><h2 ogDialogTitle id="filters-title">Filters</h2><p ogDialogDescription>Narrow the list.</p><button ogDialogClose disabled focusableWhenDisabled>Done</button></dialog></div>`,
  },
  {
    name: "alert-dialog-positive",
    family: "dialog",
    template: `<div ogAlertDialog #alert="ogAlertDialog" [(open)]="open" [dismissible]="false" (openChange)="openOutput($event)"><dialog ogDialogContent (close)="observeDialog(alert.state)"><h2 ogDialogTitle>Delete invoice?</h2><button ogDialogClose autofocus>Cancel</button></dialog></div>`,
  },
  {
    name: "alert-dialog-model",
    family: "dialog",
    template: `<div ogAlertDialog [(open)]="wrongOpen"></div>`,
    expected: {
      code: 2322,
      span: "open",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "dialog-model",
    family: "dialog",
    template: `<div ogDialog [(open)]="wrongOpen"></div>`,
    expected: {
      code: 2322,
      span: "open",
      message: /Type 'string' is not assignable to type 'boolean'/,
    },
  },
  {
    name: "dialog-content-state",
    family: "dialog",
    template: `<div ogDialog><dialog ogDialogContent #content="ogDialogContent" (close)="observeString(content.state)"></dialog></div>`,
    expected: {
      code: 2345,
      span: "state",
      message: /'OrigamiDialogContentState' is not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "dialog-content-host",
    family: "dialog",
    template: `<div ogDialog><div ogDialogContent [returnFocus]="null"></div></div>`,
    expected: {
      code: -998002,
      span: `[returnFocus]="null"`,
      message: /Can't bind to 'returnFocus' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "calendar-positive",
    family: "calendar",
    template: `<div ogCalendar #cal="ogCalendar" [(value)]="day" (valueChange)="dayOutput($event)" [(month)]="month" (monthChange)="monthOutput($event)" minDate="2026-01-01" [maxDate]="null" [dateDisabled]="weekend" [weekStart]="7" locale="en-GB" today="2026-10-27" fixedWeeks disabled readonly (click)="cal.focus({ preventScroll: true }); dayOutput(cal.state.value()); observeMonth(cal.state.month()); observeWeeks(cal.state.weeks())"><button ogCalendarPrevious aria-label="Previous month"></button><h2 ogCalendarHeading id="heading">{{ cal.state.heading() }}</h2><button ogCalendarNext aria-label="Next month"></button><table ogCalendarGrid><tbody>@for (week of cal.state.weeks(); track $index) {<tr>@for (day of week; track day.date) {<td ogCalendarCell [date]="day.date">{{ day.label }}</td>}</tr>}</tbody></table></div>`,
  },
  {
    name: "calendar-form-positive",
    family: "calendar",
    template: `<div ogField><span ogFieldLabel>Day</span><div ogCalendar #cal="ogCalendar" [formField]="form.day" minDate="2026-01-01" [maxDate]="day()" (touch)="touched()" (click)="cal.focus(); dayOutput(cal.value())"><table ogCalendarGrid></table></div></div>`,
  },
  {
    name: "calendar-form-number",
    family: "calendar",
    template: `<div ogCalendar [formField]="form.count"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /number \| null.*not assignable to type 'string \| null'/s,
    },
  },
  {
    name: "calendar-form-min",
    family: "calendar",
    template: `<div ogCalendar [min]="day()"></div>`,
    expected: {
      code: -998002,
      span: '[min]="day()"',
      message: /Can't bind to 'min' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "calendar-value",
    family: "calendar",
    template: `<div ogCalendar [(value)]="count"></div>`,
    expected: {
      code: 2322,
      span: "value",
      message: /number \| null.*not assignable to type 'string \| null'/s,
    },
  },
  {
    name: "calendar-week-start",
    family: "calendar",
    template: `<div ogCalendar [weekStart]="0"></div>`,
    expected: {
      code: 2322,
      span: "weekStart",
      message: /Type '0' is not assignable/,
    },
  },
  {
    name: "calendar-cell-date",
    family: "calendar",
    template: `<div ogCalendar><table ogCalendarGrid><tr><td ogCalendarCell></td></tr></table></div>`,
    expected: {
      code: -998008,
      span: "td",
      message: /Required input 'date' from directive OrigamiCalendarCell must be specified/,
    },
  },
  {
    name: "calendar-state-weeks",
    family: "calendar",
    template: `<div ogCalendar #cal="ogCalendar" (click)="dayOutput(cal.state.weeks())"></div>`,
    expected: {
      code: 2345,
      span: "weeks",
      message: /not assignable to parameter of type 'string'/,
    },
  },
  {
    name: "calendar-multiple-positive",
    family: "calendar",
    template: `<div ogCalendarMultiple #cal="ogCalendarMultiple" [(value)]="days" (valueChange)="daysOutput($event)" [(month)]="month" minDate="2026-01-01" [maxDate]="null" [dateDisabled]="weekend" [weekStart]="1" locale="en-GB" today="2026-10-27" fixedWeeks disabled readonly (click)="cal.focus(); daysOutput(cal.state.value()); observeMonth(cal.state.month()); observeWeeks(cal.state.weeks())"><button ogCalendarPrevious aria-label="Previous month"></button><h2 ogCalendarHeading>{{ cal.state.heading() }}</h2><button ogCalendarNext aria-label="Next month"></button><table ogCalendarGrid><tbody>@for (week of cal.state.weeks(); track $index) {<tr>@for (day of week; track day.date) {<td ogCalendarCell [date]="day.date">{{ day.label }}</td>}</tr>}</tbody></table></div>`,
  },
  {
    name: "calendar-range-positive",
    family: "calendar",
    template: `<div ogCalendarRange #cal="ogCalendarRange" [(value)]="period" (valueChange)="periodOutput($event)" [(month)]="month" minDate="2026-01-01" [dateDisabled]="weekend" today="2026-10-27" (click)="cal.focus(); periodOutput(cal.state.value()); anchorOutput(cal.state.anchor())"><table ogCalendarGrid><tbody>@for (week of cal.state.weeks(); track $index) {<tr>@for (day of week; track day.date) {<td ogCalendarCell [date]="day.date">{{ day.label }}</td>}</tr>}</tbody></table></div>`,
  },
  {
    name: "calendar-multiple-form-positive",
    family: "calendar",
    template: `<div ogField><span ogFieldLabel>Days</span><div ogCalendarMultiple [formField]="form.days" minDate="2026-01-01" (touch)="touched()"><table ogCalendarGrid></table></div></div><div ogField><span ogFieldLabel>Period</span><div ogCalendarRange [formField]="form.period" [maxDate]="day()" (touch)="touched()"><table ogCalendarGrid></table></div></div>`,
  },
  {
    name: "calendar-multiple-form-day",
    family: "calendar",
    template: `<div ogCalendarMultiple [formField]="form.day"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /string \| null.*not assignable to type 'readonly string\[\]'/s,
    },
  },
  {
    name: "calendar-range-form-day",
    family: "calendar",
    template: `<div ogCalendarRange [formField]="form.day"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /string.*not assignable to type 'OrigamiDateRange'/s,
    },
  },
  {
    name: "calendar-multiple-value",
    family: "calendar",
    template: `<div ogCalendarMultiple [(value)]="day"></div>`,
    expected: {
      code: 2322,
      span: "value",
      message: /not assignable to type 'readonly string\[\]'/,
    },
  },
  {
    name: "calendar-range-value",
    family: "calendar",
    template: `<div ogCalendarRange [(value)]="day"></div>`,
    expected: {
      code: 2322,
      span: "value",
      message: /not assignable to type 'OrigamiDateRange'/,
    },
  },
  {
    name: "calendar-multiple-min",
    family: "calendar",
    template: `<div ogCalendarMultiple [min]="day()"></div>`,
    expected: {
      code: -998002,
      span: '[min]="day()"',
      message: /Can't bind to 'min' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "calendar-multiple-state-anchor",
    family: "calendar",
    template: `<div ogCalendarMultiple #cal="ogCalendarMultiple" (click)="anchorOutput(cal.state.anchor())"></div>`,
    expected: {
      code: 2339,
      span: "anchor",
      message: /Property 'anchor' does not exist/,
    },
  },
  {
    name: "calendar-views-positive",
    family: "calendar",
    template: `<div ogCalendar #cal="ogCalendar" [(view)]="view" (viewChange)="viewOutput($event)" columns="4" (click)="viewOutput(cal.state.view()); observePeriods(cal.state.months()); observePeriods(cal.state.years())"><table ogCalendarGrid><tbody>@for (row of cal.state.years(); track $index) {<tr>@for (year of row; track year.date) {<td ogCalendarCell [date]="year.date">{{ year.label }}</td>}</tr>}</tbody></table></div><div ogCalendarMultiple #several="ogCalendarMultiple" [(view)]="view" [columns]="3" (click)="viewOutput(several.state.view())"></div><div ogCalendarRange #range="ogCalendarRange" view="months" (click)="observePeriods(range.state.months())"></div>`,
  },
  {
    name: "calendar-view",
    family: "calendar",
    template: `<div ogCalendar view="weeks"></div>`,
    expected: {
      code: 2322,
      span: "view",
      message: /"weeks"' is not assignable to type '"days" \| "months" \| "years"'/,
    },
  },
  {
    name: "calendar-view-output",
    family: "calendar",
    template: `<div ogCalendar (viewChange)="monthViewOutput($event)"></div>`,
    expected: {
      code: 2345,
      span: "$event",
      message:
        /"days" \| "months" \| "years"'.*not assignable to parameter of type '"months" \| "years"'/s,
    },
  },
  {
    name: "calendar-month-positive",
    family: "calendar",
    template: `<div ogMonthCalendar #cal="ogMonthCalendar" [(value)]="month" (valueChange)="monthOutput($event)" [(month)]="month" [(view)]="monthView" (viewChange)="monthViewOutput($event)" minMonth="2026-03" [maxMonth]="null" [monthDisabled]="weekend" locale="en-GB" today="2026-10-27" columns="4" disabled readonly (click)="cal.focus(); monthOutput(cal.state.value()); observeMonth(cal.state.month()); monthViewOutput(cal.state.view()); observePeriods(cal.state.months()); observePeriods(cal.state.years())"><button ogCalendarPrevious aria-label="Previous year"></button><h2 ogCalendarHeading>{{ cal.state.heading() }}</h2><button ogCalendarNext aria-label="Next year"></button><table ogCalendarGrid><tbody>@for (row of cal.state.months(); track $index) {<tr>@for (m of row; track m.date) {<td ogCalendarCell [date]="m.date">{{ m.label }}</td>}</tr>}</tbody></table></div>`,
  },
  {
    name: "calendar-month-form-positive",
    family: "calendar",
    template: `<div ogField><span ogFieldLabel>Start</span><div ogMonthCalendar #cal="ogMonthCalendar" [formField]="form.start" minMonth="2026-03" [maxMonth]="month()" (touch)="touched()" (click)="cal.focus(); monthOutput(cal.value())"><table ogCalendarGrid></table></div></div>`,
  },
  {
    name: "calendar-month-form-days",
    family: "calendar",
    template: `<div ogMonthCalendar [formField]="form.days"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /readonly string\[\].*not assignable to type 'string'/s,
    },
  },
  {
    name: "calendar-month-days-view",
    family: "calendar",
    template: `<div ogMonthCalendar [(view)]="view"></div>`,
    expected: {
      code: 2322,
      span: "view",
      message: /"days".*not assignable to type '"months" \| "years"'/s,
    },
  },
  {
    name: "calendar-month-min",
    family: "calendar",
    template: `<div ogMonthCalendar [min]="month()"></div>`,
    expected: {
      code: -998002,
      span: '[min]="month()"',
      message: /Can't bind to 'min' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "calendar-month-week-start",
    family: "calendar",
    template: `<div ogMonthCalendar [weekStart]="1"></div>`,
    expected: {
      code: -998002,
      span: '[weekStart]="1"',
      message: /Can't bind to 'weekStart' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "select-positive",
    family: "select",
    template: `<div ogSelect #select="ogSelect" [(value)]="count" (valueChange)="countOutput($event)" [(open)]="open"><button ogSelectTrigger id="count" disabled focusableWhenDisabled (click)="countOutput(select.state.value()); observeRecord(select.state.selectedOption()); observeBoolean(select.state.open())">Count</button><div ogSelectContent side="block-start" align="end" [gap]="4"><div ogSelectOption #one="ogSelectOption" [value]="1" label="One" disabled (click)="observeOption(one.state)">One</div><div ogSelectOption value="1">String one</div></div></div><div ogSelect [(value)]="agree" (valueChange)="agreeOutput($event)"><div ogSelectOption [value]="true">Yes</div></div><div ogSelect [value]="size()" (valueChange)="size.set($event)"><div ogSelectOption value="m">M</div></div>`,
  },
  {
    name: "select-form-positive",
    family: "select",
    template: `<div ogField><span ogFieldLabel>Priority</span><div ogSelect #priority="ogSelect" [formField]="form.priority" (touch)="touched()" (click)="priority.focus({ preventScroll: true }); countOutput(priority.state.value()); countOutput(priority.value())"><button ogSelectTrigger>Priority</button><div ogSelectContent><div ogSelectOption [value]="1">Low</div></div></div><p ogFieldDescription>How urgent</p></div><div ogSelect #agree="ogSelect" [formField]="form.agree" (click)="agree.focus(); agreeOutput(agree.state.value())"><div ogSelectOption [value]="true">Yes</div></div><div ogSelect #size="ogSelect" [formField]="form.size" (click)="stringOutput(size.state.value())"><div ogSelectOption value="m">M</div></div>`,
  },
  {
    name: "select-form-number",
    family: "select",
    template: `<div ogSelect #priority="ogSelect" [formField]="form.priority" (click)="stringOutput(priority.state.value())"></div>`,
    expected: {
      code: 2345,
      span: "value",
      message: /number \| null.*not assignable to parameter of type 'string \| null'/s,
    },
  },
  {
    name: "select-form-boolean",
    family: "select",
    template: `<div ogSelect #agree="ogSelect" [formField]="form.agree" (click)="countOutput(agree.state.value())"></div>`,
    expected: {
      code: 2345,
      span: "value",
      message: /boolean \| null.*not assignable to parameter of type 'number \| null'/s,
    },
  },
  {
    name: "select-form-string",
    family: "select",
    template: `<div ogSelect #size="ogSelect" [formField]="form.size" (click)="agreeOutput(size.state.value())"></div>`,
    expected: {
      code: 2345,
      span: "value",
      message: /string \| null.*not assignable to parameter of type 'boolean \| null'/s,
    },
  },
  {
    name: "select-form-object",
    family: "select",
    template: `<div ogSelect [formField]="form.shape"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /not assignable to type 'string \| number \| boolean \| null'/s,
    },
  },
  {
    name: "select-form-array",
    family: "select",
    template: `<div ogSelect [formField]="form.tags"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /string\[\]/,
    },
  },
  {
    name: "select-form-state-input",
    family: "select",
    template: `<div ogSelect [required]="true"></div>`,
    expected: {
      code: -998002,
      span: '[required]="true"',
      message: /Can't bind to 'required' since it isn't a known property of 'div'/,
    },
  },
  {
    name: "select-output",
    family: "select",
    template: `<div ogSelect [(value)]="count" (valueChange)="stringOutput($event)"></div>`,
    expected: {
      code: 2345,
      span: "$event",
      message: /number \| null.*not assignable to parameter of type 'string \| null'/s,
    },
  },
  {
    name: "select-state-value",
    family: "select",
    template: `<div ogSelect #select="ogSelect" [(value)]="count"><button ogSelectTrigger (click)="stringOutput(select.state.value())"></button></div>`,
    expected: {
      code: 2345,
      span: "value",
      message: /number \| null.*not assignable to parameter of type 'string \| null'/s,
    },
  },
  {
    name: "select-object-value",
    family: "select",
    template: `<div ogSelect [(value)]="shape"></div>`,
    expected: {
      code: 2322,
      span: "value",
      message: /not assignable to type 'string \| number \| boolean \| null'/s,
    },
  },
  {
    name: "select-option-value",
    family: "select",
    template: `<div ogSelect><div ogSelectOption>Missing</div></div>`,
    expected: {
      code: -998008,
      span: "div",
      message: /Required input 'value' from directive OrigamiSelectOption must be specified/,
    },
  },
  {
    name: "select-trigger-state",
    family: "select",
    template: `<div ogSelect #select="ogSelect" [(value)]="count"><button ogSelectTrigger #trigger="ogSelectTrigger" (click)="countOutput(trigger.state.value())"></button></div>`,
    expected: {
      code: 2339,
      span: "state",
      message: /Property 'state' does not exist on type 'OrigamiSelectTrigger'/,
    },
  },
  {
    name: "select-multiple-positive",
    family: "select",
    template: `<div ogSelectMultiple #pick="ogSelectMultiple" [(value)]="counts" (valueChange)="countsOutput($event)" [(open)]="open"><button ogSelectTrigger (click)="countsOutput(pick.state.value()); observeRecords(pick.state.selectedOptions()); observeBoolean(pick.state.open()); observeBoolean(pick.state.disabled())">{{ pick.state.value().length }} selected</button><div ogSelectContent><div ogSelectOption #one="ogSelectOption" [value]="1" label="One" (click)="observeOption(one.state)">One</div></div></div>`,
  },
  {
    name: "select-multiple-form-positive",
    family: "select",
    template: `<div ogField><span ogFieldLabel>Labels</span><div ogSelectMultiple #ids="ogSelectMultiple" [formField]="form.ids" (touch)="touched()" (click)="ids.focus({ preventScroll: true }); countsOutput(ids.state.value()); countsOutput(ids.value()); observeRecords(ids.state.selectedOptions())"><button ogSelectTrigger>Labels</button><div ogSelectContent><div ogSelectOption [value]="1">One</div></div></div></div><div ogSelectMultiple #tags="ogSelectMultiple" [formField]="form.tags" (click)="tags.focus(); tagsOutput(tags.state.value())"><div ogSelectOption value="a">A</div></div><div ogSelectMultiple #flags="ogSelectMultiple" [formField]="form.flags" (click)="flagsOutput(flags.state.value())"><div ogSelectOption [value]="true">Yes</div></div>`,
  },
  {
    name: "select-multiple-form-number",
    family: "select",
    template: `<div ogSelectMultiple #ids="ogSelectMultiple" [formField]="form.ids" (click)="tagsOutput(ids.state.value())"></div>`,
    expected: {
      code: 2345,
      span: "value",
      message: /readonly number\[\].*not assignable to parameter of type 'readonly string\[\]'/s,
    },
  },
  {
    name: "select-multiple-form-scalar",
    family: "select",
    template: `<div ogSelectMultiple [formField]="form.priority"></div>`,
    expected: {
      code: 2322,
      span: "formField",
      message: /number \| null/,
    },
  },
  {
    name: "state-positive",
    family: "state",
    template: `<section ogAccordionSingle><article ogAccordionItem #item="ogAccordionItem" (click)="observeCollapsible(item.state); observeBoolean(item.state.expanded()); observeBoolean(item.state.disabled())"><div ogAccordionPanel #panel="ogAccordionPanel" (click)="observePresence(panel.state); observeBoolean(panel.state.open())"></div></article></section><section ogCollapsible><div ogCollapsiblePanel #collapsiblePanel="ogCollapsiblePanel" (click)="observePresence(collapsiblePanel.state); observeBoolean(collapsiblePanel.state.open())"></div></section><div ogToggleGroupSingle><button ogToggleGroupItem #toggleItem="ogToggleGroupItem" (click)="observeToggle(toggleItem.state); observeBoolean(toggleItem.state.checked()); observeBoolean(toggleItem.state.disabled())">Bold</button></div>`,
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

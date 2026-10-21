import { signal, type ProviderToken, type Signal, type WritableSignal } from "@angular/core";
import type * as OrigamiRoot from "@loozo/origami-ui";
import { injectDeferred, injectUniqueId, injectUniqueValue } from "@loozo/origami-ui/utils";
import type { OrigamiCollectionState } from "@loozo/origami-ui/collection";
import type { OrigamiPresenceState } from "@loozo/origami-ui/presence";
import type {
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleState,
  OrigamiCollapsibleHiding,
} from "@loozo/origami-ui/collapsible";
import type {
  OrigamiAccordionOptions,
  OrigamiAccordionState,
  OrigamiAccordionItem,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";
import {
  OrigamiAccordionSingleOptions,
  OrigamiAccordionMultipleOptions,
  OrigamiAccordionItemOptions,
} from "@loozo/origami-ui/accordion";
import type {
  OrigamiPopoverState,
  OrigamiPopoverContentState} from "@loozo/origami-ui/popover";
import {
  OrigamiPopoverContentOptions,
  type OrigamiPopoverTriggerOptions,
  type OrigamiPopoverSide,
  type OrigamiPopoverAlign,
} from "@loozo/origami-ui/popover";
import { OrigamiToggleOptions, type OrigamiToggleState } from "@loozo/origami-ui/toggle";
import {
  OrigamiTabsOptions,
  OrigamiTabsTriggerOptions,
  OrigamiTabsPanelOptions,
  type OrigamiTabsState,
  type OrigamiTabsOrientation,
  type OrigamiTabsActivation,
} from "@loozo/origami-ui/tabs";
import {
  OrigamiToggleGroupSingleOptions,
  OrigamiToggleGroupMultipleOptions,
  OrigamiToggleGroupItemOptions,
  type OrigamiToggleGroupItem,
  type OrigamiToggleGroupState,
  type OrigamiToggleGroupOrientation,
} from "@loozo/origami-ui/toggle-group";
import {
  OrigamiToolbarOptions,
  type OrigamiToolbarItem,
  type OrigamiToolbarPopoverTrigger,
  type OrigamiToolbarToggle,
  type OrigamiToolbarRadioGroup,
  type OrigamiToolbarToggleGroupMultiple,
  type OrigamiToolbarToggleGroupSingle,
  type OrigamiToolbarState,
  type OrigamiToolbarOrientation,
} from "@loozo/origami-ui/toolbar";
import {
  OrigamiRadioGroupOptions,
  OrigamiRadioGroupItemOptions,
  type OrigamiRadioGroupState,
} from "@loozo/origami-ui/radio-group";
import { OrigamiButtonOptions } from "@loozo/origami-ui/button";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipContentOptions,
  OrigamiTooltipContentState,
  OrigamiTooltipOptions,
  OrigamiTooltipState,
} from "@loozo/origami-ui/tooltip";
import {
  OrigamiField,
  OrigamiFieldControl,
  OrigamiFieldControlOptions,
  OrigamiFieldDescription,
  OrigamiFieldDescriptionOptions,
  OrigamiFieldError,
  OrigamiFieldErrorOptions,
  OrigamiFieldLabel,
  OrigamiFieldLabelOptions,
  OrigamiFieldState,
} from "@loozo/origami-ui/field";
import type { FormCheckboxControl } from "@angular/forms/signals";
import {
  OrigamiCheckbox,
  OrigamiCheckboxOptions,
  OrigamiCheckboxState,
} from "@loozo/origami-ui/checkbox";
import { OrigamiSwitch, OrigamiSwitchOptions, OrigamiSwitchState } from "@loozo/origami-ui/switch";

type ExpectNever<T extends never> = T;
export type NoRootValueExports = ExpectNever<keyof typeof OrigamiRoot>;

/** Compile-only. Never invoke negative checks or import this file into a runtime fixture. */
export function checkReadonlyState(
  collection: OrigamiCollectionState,
  presence: OrigamiPresenceState,
  collapsible: OrigamiCollapsibleState,
  accordion: OrigamiAccordionState,
  popover: OrigamiPopoverState,
  content: OrigamiPopoverContentState,
  toggle: OrigamiToggleState,
  tabs: OrigamiTabsState,
  toggleGroup: OrigamiToggleGroupState,
  toolbar: OrigamiToolbarState,
  radioGroup: OrigamiRadioGroupState,
): void {
  // @ts-expect-error Collection observation is not writable.
  collection.items.set([]);
  // @ts-expect-error Collection arrays are readonly.
  collection.items().push({ value: signal("new") });

  for (const item of collection.items()) {
    // @ts-expect-error Registered value observation is not writable.
    item.value.set("new");
  }

  // @ts-expect-error Presence retention is not writable.
  presence.open.set(false);
  // @ts-expect-error Presence phase is not writable.
  presence.phase.update(() => "closed");
  // @ts-expect-error Collapsible observation is not writable.
  collapsible.expanded.set(true);
  // @ts-expect-error Collapsible disabled observation is not writable.
  collapsible.disabled.set(false);
  // @ts-expect-error Accordion item observation is not writable.
  accordion.itemValues.set([]);
  // @ts-expect-error Accordion values are readonly arrays.
  accordion.itemValues().push("new");
  // @ts-expect-error Accordion disabled observation is not writable.
  accordion.disabled.set(false);
  // @ts-expect-error Popover desired-state observation is not writable.
  popover.open.update((value) => !value);
  // @ts-expect-error Popover disabled observation is not writable.
  popover.disabled.set(false);
  // @ts-expect-error Popover dismissal observation is not writable.
  popover.dismissible.set(false);
  // @ts-expect-error Content retention is not writable.
  content.open.set(false);
  // @ts-expect-error Toggle checked observation is not writable.
  toggle.checked.set(true);
  // @ts-expect-error Toggle disabled observation is not writable.
  toggle.disabled.update((value) => !value);
  // @ts-expect-error Tabs selection observation is not writable.
  tabs.value.set("billing");
  // @ts-expect-error Tabs orientation observation is not writable.
  tabs.orientation.set("vertical");
  // @ts-expect-error ToggleGroup disabled observation is not writable.
  toggleGroup.disabled.set(true);
  // @ts-expect-error ToggleGroup orientation observation is not writable.
  toggleGroup.orientation.set("vertical");
  // @ts-expect-error Toolbar orientation observation is not writable.
  toolbar.orientation.set("vertical");
  // @ts-expect-error RadioGroup value observation is not writable.
  radioGroup.value.set("express");
  // @ts-expect-error RadioGroup disabled observation is not writable.
  radioGroup.disabled.set(true);
}

export function checkModeBoundaries(shared: OrigamiAccordionOptions): void {
  // @ts-expect-error Shared Options have no single/multiple value property.
  void shared.value;
  // @ts-expect-error Shared Options have no Single-specific property.
  void shared.collapsible;

  // @ts-expect-error Multiple Options do not gain Single's collapsible setting.
  const multipleCollapsible: OrigamiAccordionMultipleOptions["collapsible"] = signal(false);

  void multipleCollapsible;

  // @ts-expect-error Single value is a nullable string, not an array.
  const singleValue: OrigamiAccordionSingleOptions["value"] = signal<readonly string[]>([]);

  void singleValue;

  // @ts-expect-error Multiple value is an array, not a nullable string.
  const multipleValue: OrigamiAccordionMultipleOptions["value"] = signal<string | null>(null);

  void multipleValue;

  // @ts-expect-error Multiple ToggleGroup Options do not gain Single's deselectable setting.
  const multipleDeselectable: OrigamiToggleGroupMultipleOptions["deselectable"] = signal(false);

  void multipleDeselectable;

  // @ts-expect-error Single ToggleGroup value is a nullable string, not an array.
  const pressedValue: OrigamiToggleGroupSingleOptions["value"] = signal<readonly string[]>([]);

  void pressedValue;

  // @ts-expect-error RadioGroup value is a nullable string, not an array.
  const checkedValue: OrigamiRadioGroupOptions["value"] = signal<readonly string[]>([]);

  void checkedValue;

  // @ts-expect-error ID-only Content replacements lack the required placement properties.
  const content: OrigamiPopoverContentOptions = { id: signal("id-only") };

  void content;

  // @ts-expect-error Physical Floating UI placement is not the public logical side type.
  const side: OrigamiPopoverSide = "bottom";

  void side;
}

export abstract class AbstractSingleOptions {
  abstract readonly value: WritableSignal<string | null>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly collapsible: Signal<boolean>;
}

/** Positive structural/provider checks, to be typechecked against genuine built declarations. */
export function checkProviderShapes(): void {
  OrigamiAccordionSingleOptions.provideExisting(() => AbstractSingleOptions);
  OrigamiAccordionSingleOptions.provideFactory(() => ({
    value: signal<string | null>(null),
    disabled: signal(false),
    collapsible: signal(false),
  }));
  OrigamiAccordionMultipleOptions.provideFactory(() => ({
    value: signal<readonly string[]>([]),
    disabled: signal(false),
  }));
  OrigamiAccordionItemOptions.provideFactory(() => ({
    value: signal("billing"),
    disabled: signal(false),
    hiding: signal<OrigamiCollapsibleHiding>("until-found"),
  }));
  OrigamiPopoverContentOptions.provideFactory(() => ({
    id: signal("complete-content"),
    side: signal<OrigamiPopoverSide>("block-end"),
    align: signal<OrigamiPopoverAlign>("start"),
    gap: signal(8),
  }));
  OrigamiToggleOptions.provideFactory(() => ({
    checked: signal(false),
    disabled: signal(false),
    focusableWhenDisabled: signal(false),
    id: signal("complete-toggle"),
  }));
  OrigamiTabsOptions.provideFactory(() => ({
    value: signal<string | null>(null),
    disabled: signal(false),
    orientation: signal<OrigamiTabsOrientation>("vertical"),
    activation: signal<OrigamiTabsActivation>("manual"),
  }));
  OrigamiTabsTriggerOptions.provideFactory(() => ({
    value: signal("billing"),
    id: signal("billing-tab"),
    disabled: signal(false),
    focusableWhenDisabled: signal(true),
  }));
  OrigamiTabsPanelOptions.provideFactory(() => ({
    value: signal("billing"),
    id: signal("billing-panel"),
  }));
  OrigamiToggleGroupSingleOptions.provideFactory(() => ({
    value: signal<string | null>("start"),
    disabled: signal(false),
    orientation: signal<OrigamiToggleGroupOrientation>("vertical"),
    deselectable: signal(true),
  }));
  OrigamiToggleGroupMultipleOptions.provideFactory(() => ({
    value: signal<readonly string[]>(["bold"]),
    disabled: signal(false),
    orientation: signal<OrigamiToggleGroupOrientation>("horizontal"),
  }));
  OrigamiToggleGroupItemOptions.provideFactory(() => ({
    value: signal("bold"),
    disabled: signal(false),
    focusableWhenDisabled: signal(false),
    id: signal("complete-toggle-group-item"),
  }));
  OrigamiToolbarOptions.provideFactory(() => ({
    orientation: signal<OrigamiToolbarOrientation>("vertical"),
  }));
  OrigamiButtonOptions.provideFactory(() => ({
    disabled: signal(false),
    focusableWhenDisabled: signal(true),
  }));
  OrigamiRadioGroupOptions.provideFactory(() => ({
    value: signal<string | null>("express"),
    disabled: signal(false),
  }));
  OrigamiRadioGroupItemOptions.provideFactory(() => ({
    value: signal("express"),
    disabled: signal(false),
    focusableWhenDisabled: signal(false),
  }));
}

export function checkUtilitySignatures(token: ProviderToken<number>): void {
  const resolve: () => number = injectDeferred(token);
  const id: string = injectUniqueId("element-key");
  const value: string = injectUniqueValue("value-key");

  void resolve;
  void id;
  void value;
}

/** Toolbar groups are the standalone groups' Options and expose the same State. */
export function checkToolbarGroups(
  single: OrigamiToolbarToggleGroupSingle,
  multiple: OrigamiToolbarToggleGroupMultiple,
  radio: OrigamiToolbarRadioGroup,
): void {
  const singleOptions: OrigamiToggleGroupSingleOptions = single;
  const multipleOptions: OrigamiToggleGroupMultipleOptions = multiple;
  const radioOptions: OrigamiRadioGroupOptions = radio;
  const toggleGroupState: OrigamiToggleGroupState = single.state;
  const radioGroupState: OrigamiRadioGroupState = radio.state;

  void singleOptions;
  void multipleOptions;
  void radioOptions;
  void toggleGroupState;
  void radioGroupState;
}

/** Each composing directive exposes the State its composed primitive provides on the same element. */
export function checkComposedStates(
  accordionItem: OrigamiAccordionItem,
  accordionPanel: OrigamiAccordionPanel,
  collapsiblePanel: OrigamiCollapsiblePanel,
  toggleGroupItem: OrigamiToggleGroupItem,
): void {
  const itemOptions: OrigamiAccordionItemOptions = accordionItem;
  const itemState: OrigamiCollapsibleState = accordionItem.state;
  const accordionPanelState: OrigamiPresenceState = accordionPanel.state;
  const collapsiblePanelState: OrigamiPresenceState = collapsiblePanel.state;
  const toggleGroupItemState: OrigamiToggleState = toggleGroupItem.state;

  void itemOptions;
  void itemState;
  void accordionPanelState;
  void collapsiblePanelState;
  void toggleGroupItemState;
}

/**
 * The Toolbar's controls take their composed primitive's Options: an item is Button Options, a
 * Toolbar Toggle is a Toggle with its State and a Toolbar Popover Trigger is a Popover Trigger.
 */
export function checkToolbarControls(
  item: OrigamiToolbarItem,
  toggle: OrigamiToolbarToggle,
  trigger: OrigamiToolbarPopoverTrigger,
): void {
  const itemOptions: OrigamiButtonOptions = item;
  const toggleOptions: OrigamiToggleOptions = toggle;
  const toggleState: OrigamiToggleState = toggle.state;
  const triggerOptions: OrigamiPopoverTriggerOptions = trigger;

  void itemOptions;
  void toggleOptions;
  void toggleState;
  void triggerOptions;
}

/** Tooltip's root and Content are their own Options and expose the State they provide. */
export function checkTooltipParts(root: OrigamiTooltip, content: OrigamiTooltipContent): void {
  const rootOptions: OrigamiTooltipOptions = root;
  const rootState: OrigamiTooltipState = root.state;
  const contentOptions: OrigamiTooltipContentOptions = content;
  const contentState: OrigamiTooltipContentState = content.state;

  void rootOptions;
  void rootState;
  void contentOptions;
  void contentState;
}

/** Field's root exposes the State it provides; each part is its own Options. */
export function checkFieldParts(
  root: OrigamiField,
  label: OrigamiFieldLabel,
  control: OrigamiFieldControl,
  description: OrigamiFieldDescription,
  error: OrigamiFieldError,
): void {
  const rootState: OrigamiFieldState = root.state;
  const labelOptions: OrigamiFieldLabelOptions = label;
  const controlOptions: OrigamiFieldControlOptions = control;
  const descriptionOptions: OrigamiFieldDescriptionOptions = description;
  const errorOptions: OrigamiFieldErrorOptions = error;

  void rootState;
  void labelOptions;
  void controlOptions;
  void descriptionOptions;
  void errorOptions;
}

/** Checkbox and Switch are their own Options, expose their State and are Signal Forms checkbox controls. */
export function checkBooleanControls(checkbox: OrigamiCheckbox, toggle: OrigamiSwitch): void {
  const checkboxState: OrigamiCheckboxState = checkbox.state;
  const checkboxOptions: OrigamiCheckboxOptions = checkbox;
  const checkboxControl: FormCheckboxControl = checkbox;
  const switchState: OrigamiSwitchState = toggle.state;
  const switchOptions: OrigamiSwitchOptions = toggle;
  const switchControl: FormCheckboxControl = toggle;

  void checkboxState;
  void checkboxOptions;
  void checkboxControl;
  void switchState;
  void switchOptions;
  void switchControl;
}

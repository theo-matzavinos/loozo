import { signal, type ProviderToken, type Signal, type WritableSignal } from "@angular/core";
import type * as OrigamiRoot from "@loozo/origami-ui";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import type { OrigamiCollectionState } from "@loozo/origami-ui/collection";
import type { OrigamiPresenceState } from "@loozo/origami-ui/presence";
import type { OrigamiCollapsibleState } from "@loozo/origami-ui/collapsible";
import type {
  OrigamiAccordionOptions,
  OrigamiAccordionState} from "@loozo/origami-ui/accordion";
import {
  OrigamiAccordionSingleOptions,
  OrigamiAccordionMultipleOptions
} from "@loozo/origami-ui/accordion";
import type {
  OrigamiPopoverState,
  OrigamiPopoverContentState} from "@loozo/origami-ui/popover";
import {
  OrigamiPopoverContentOptions,
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
  // @ts-expect-error Toggle pressed observation is not writable.
  toggle.pressed.set(true);
  // @ts-expect-error Toggle disabled observation is not writable.
  toggle.disabled.update((value) => !value);
  // @ts-expect-error Tabs selection observation is not writable.
  tabs.value.set("billing");
  // @ts-expect-error Tabs orientation observation is not writable.
  tabs.orientation.set("vertical");
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

  // @ts-expect-error ID-only Content replacements require migration.
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
  OrigamiPopoverContentOptions.provideFactory(() => ({
    id: signal("complete-content"),
    side: signal<OrigamiPopoverSide>("block-end"),
    align: signal<OrigamiPopoverAlign>("start"),
    gap: signal(8),
  }));
  OrigamiToggleOptions.provideFactory(() => ({
    pressed: signal(false),
    disabled: signal(false),
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
  }));
  OrigamiTabsPanelOptions.provideFactory(() => ({
    value: signal("billing"),
    id: signal("billing-panel"),
  }));
}

export function checkUtilitySignatures(token: ProviderToken<number>): void {
  const resolve: () => number = injectDeferred(token);
  const id: string = injectUniqueId("opaque-key");

  void resolve;
  void id;
}

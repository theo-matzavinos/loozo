import { Directive, computed, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { OrigamiCollectionState } from "@loozo/origami-ui/collection";
import { OrigamiPresenceState } from "@loozo/origami-ui/presence";
import { OrigamiCollapsibleState } from "@loozo/origami-ui/collapsible";
import { OrigamiAccordionState } from "@loozo/origami-ui/accordion";
import { OrigamiPopoverState, OrigamiPopoverContentState } from "@loozo/origami-ui/popover";

/** Observes only named public signals, including runtime absence of writable mutation aliases. */
@Directive({ selector: "[readonlyStates]", exportAs: "readonlyStates" })
export class ReadonlyStates {
  readonly collection = inject(OrigamiCollectionState, { optional: true });
  readonly presence = inject(OrigamiPresenceState, { optional: true });
  readonly collapsible = inject(OrigamiCollapsibleState, { optional: true });
  readonly accordion = inject(OrigamiAccordionState, { optional: true });
  readonly popover = inject(OrigamiPopoverState, { optional: true });
  readonly content = inject(OrigamiPopoverContentState, { optional: true });
  readonly observations = computed(() => {
    const observations: Signal<unknown>[] = [];

    if (this.collection) {
      observations.push(this.collection.items);

      for (const item of this.collection.items()) {
        observations.push(item.value);
      }
    }

    if (this.presence) {
      observations.push(this.presence.phase, this.presence.open);
    }

    if (this.collapsible) {
      observations.push(this.collapsible.expanded, this.collapsible.disabled);
    }

    if (this.accordion) {
      observations.push(this.accordion.itemValues, this.accordion.disabled);
    }

    if (this.popover) {
      observations.push(this.popover.open, this.popover.disabled, this.popover.dismissible);
    }

    if (this.content) {
      observations.push(this.content.open);
    }

    return observations;
  });
  readonly valid = computed(() => {
    const observations = this.observations();

    if (observations.length === 0) {
      return false;
    }

    for (const observation of observations) {
      if (Reflect.has(observation, "set") || Reflect.has(observation, "update")) {
        return false;
      }
    }

    return true;
  });
}

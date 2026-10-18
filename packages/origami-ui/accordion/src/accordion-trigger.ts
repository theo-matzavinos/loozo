import { Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiCollapsibleTrigger,
  OrigamiCollapsibleTriggerOptions,
} from "@loozo/origami-ui/collapsible";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { AccordionItemContext } from "./accordion-item";

/**
 * Effective upper Trigger identity, forwarded to the composed Collapsible Options token.
 * Helper providers replace identity locally.
 */
export abstract class OrigamiAccordionTriggerOptions {
  /** Authoritative reactive DOM ID for this Trigger and its mounted Panel's labelling association. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces upper Trigger configuration; no lower Options replacement is required.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionTriggerOptions> | AbstractType<OrigamiAccordionTriggerOptions>,
  ): Provider {
    return { provide: OrigamiAccordionTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces upper Trigger identity as a whole.
   * @param factory - Injection-context factory supplying the required id signal.
   * @returns A local provider; lower behavior reads this upper token, not the upper directive.
   */
  static provideFactory(factory: () => OrigamiAccordionTriggerOptions): Provider {
    return { provide: OrigamiAccordionTriggerOptions, useFactory: factory };
  }
}

/**
 * Native type=button Trigger composed through Collapsible. Effective upper ID Options
 * drive the lower bindings and mounted-only association. A selected non-collapsible Single
 * item's Trigger is locked: the composed Collapsible Trigger's own disabled, so it has
 * `aria-disabled="true"` and `data-disabled` and ignores activation, but stays natively
 * enabled and focusable unless its root or item is disabled.
 * Requires a nearest Accordion Item. No custom Enter/Space or arrow-key handler is added.
 */
@Directive({
  selector: "button[ogAccordionTrigger]",
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [
    OrigamiAccordionTriggerOptions.provideExisting(() => OrigamiAccordionTrigger),
    OrigamiCollapsibleTriggerOptions.provideFactory(() => {
      const upper = inject(OrigamiAccordionTriggerOptions);
      const item = inject(AccordionItemContext);

      return {
        id: upper.id,
        disabled: item.locked,
        // A disabled item or root still disables natively; only locked stays focusable.
        focusableWhenDisabled: computed(() => !item.disabled()),
      };
    }),
  ],
})
export class OrigamiAccordionTrigger implements OrigamiAccordionTriggerOptions {
  /** Own ID input, default opaque generated identity; static/bound IDs remain authoritative unless upper Options are replaced. */
  readonly id = input(injectUniqueId("accordion-trigger"));

  /** Validates the nearest Accordion Item synchronously, without resolving the composed Options during construction. */
  constructor() {
    inject(AccordionItemContext);
  }
}

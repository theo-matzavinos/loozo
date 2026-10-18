import { Directive, booleanAttribute, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiCollapsibleTrigger,
  OrigamiCollapsibleTriggerOptions,
} from "@loozo/origami-ui/collapsible";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { AccordionItemContext } from "./accordion-item";

/**
 * Effective upper Trigger identity and disabled focusability, forwarded to the composed
 * Collapsible Options token. Helper providers replace them locally.
 */
export abstract class OrigamiAccordionTriggerOptions {
  /** Authoritative reactive DOM ID for this Trigger and its mounted Panel's labelling association. */
  abstract readonly id: Signal<string>;
  /**
   * While the root or item disables the Trigger, it stays focusable: `aria-disabled="true"` and
   * `data-disabled` without native `disabled`. Activation stays blocked, but the button's own
   * `(click)` listeners still run. A locked Trigger stays natively enabled and focusable unless the
   * root or item also disables it and this is false. Default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

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
   * Replaces upper Trigger configuration as a whole.
   * @param factory - Injection-context factory supplying the required `id` and
   *   `focusableWhenDisabled` signals.
   * @returns A local provider; lower behavior reads this upper token, not the upper directive.
   */
  static provideFactory(factory: () => OrigamiAccordionTriggerOptions): Provider {
    return { provide: OrigamiAccordionTriggerOptions, useFactory: factory };
  }
}

/**
 * Native type=button Trigger composed through Collapsible, and through it `ogButton`. Effective
 * upper Options drive the lower bindings and mounted-only association. A selected
 * non-collapsible Single item's Trigger is locked: the composed Collapsible Trigger's own
 * disabled, so it has `aria-disabled="true"` and `data-disabled` and ignores activation, but
 * stays natively enabled and focusable unless its root or item is disabled and
 * `focusableWhenDisabled` is false.
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
        // A disabled item or root disables natively unless the Trigger stays focusable; locked alone always stays focusable.
        focusableWhenDisabled: computed(() => upper.focusableWhenDisabled() || !item.disabled()),
      };
    }),
  ],
})
export class OrigamiAccordionTrigger implements OrigamiAccordionTriggerOptions {
  /** Own ID input, default opaque generated identity; static/bound IDs remain authoritative unless upper Options are replaced. */
  readonly id = input(injectUniqueId("accordion-trigger"));
  /** Own input keeping the Trigger focusable while its root or item disables it, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });

  /** Validates the nearest Accordion Item synchronously, without resolving the composed Options during construction. */
  constructor() {
    inject(AccordionItemContext);
  }
}

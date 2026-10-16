import { Directive, InjectionToken, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiCollapsibleTrigger,
  OrigamiCollapsibleTriggerOptions,
} from "@loozo/origami-ui/collapsible";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { AccordionItemContext } from "./accordion-item";

const triggerReplacement = new InjectionToken<OrigamiAccordionTriggerOptions>(
  "Accordion Trigger replacement",
);

/**
 * Effective upper Trigger identity, forwarded to the composed Collapsible Options token.
 * Helper provider arrays replace identity locally, independent of co-matched directive import order.
 */
export abstract class OrigamiAccordionTriggerOptions {
  /** Authoritative reactive DOM ID for this Trigger and its mounted Panel's labelling association. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces upper Trigger configuration; no lower Options replacement is required.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array for direct or host-composed Triggers.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionTriggerOptions> | AbstractType<OrigamiAccordionTriggerOptions>,
  ): Provider[] {
    return [
      { provide: triggerReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * Replaces upper Trigger identity as a whole.
   * @param factory - Injection-context factory supplying the required id signal.
   * @returns A local replacement-and-alias provider array; lower behavior reads this upper token, not the upper directive.
   */
  static provideFactory(factory: () => OrigamiAccordionTriggerOptions): Provider[] {
    return [
      { provide: triggerReplacement, useFactory: factory },
      { provide: OrigamiAccordionTriggerOptions, useExisting: triggerReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only Trigger default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local array holding one Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(type: () => Type<OrigamiAccordionTriggerOptions>): Provider[] {
    return [
      {
        provide: OrigamiAccordionTriggerOptions,
        useFactory: () => {
          const replacement = inject(triggerReplacement, {
            self: true,
            optional: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject<OrigamiAccordionTriggerOptions>(forwardRef(type));
        },
      },
    ];
  }
}

/**
 * Native type=button Trigger composed through Collapsible. Effective upper ID Options
 * drive the lower bindings and mounted-only association. Selected non-collapsible Single
 * items are aria-disabled but stay natively enabled/focusable unless root/item disabled.
 * Requires a nearest Accordion Item. No custom Enter/Space or arrow-key handler is added.
 */
@Directive({
  selector: "button[ogAccordionTrigger]",
  hostDirectives: [OrigamiCollapsibleTrigger],
  providers: [
    OrigamiAccordionTriggerOptions.ɵprovideDefault(() => OrigamiAccordionTrigger),
    OrigamiCollapsibleTriggerOptions.provideFactory(() => inject(OrigamiAccordionTriggerOptions)),
  ],
  host: { "[attr.aria-disabled]": "disabledAria()" },
})
export class OrigamiAccordionTrigger implements OrigamiAccordionTriggerOptions {
  /** Own ID input, default opaque generated identity; static/bound IDs remain authoritative unless upper Options are replaced. */
  readonly id = input(injectUniqueId("accordion-trigger"));

  readonly #item = inject(AccordionItemContext);

  /** @internal Combined native-disabled/non-collapsible ARIA policy; lower native disabled binding is unchanged. */
  protected readonly disabledAria = computed(() => {
    if (this.#item.disabled() || this.#item.locked()) {
      return "true";
    }

    return null;
  });
}

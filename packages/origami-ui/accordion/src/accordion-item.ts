import {
  DestroyRef,
  Directive,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiCollectionItem, OrigamiCollectionItemOptions } from "@loozo/origami-ui/collection";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleOptions,
  OrigamiCollapsibleState,
} from "@loozo/origami-ui/collapsible";
import type { OrigamiCollapsibleHiding } from "@loozo/origami-ui/collapsible";
import { injectDeferred, injectUniqueValue } from "@loozo/origami-ui/utils";
import { AccordionContext } from "./accordion";

/**
 * Effective upper Item configuration. It drives the composed Collection Item's value and the
 * composed Collapsible's disabled state and hiding, so replacing only these Options configures the
 * item without lower Options. The lower adapters resolve it after construction, when Angular has
 * set the item's inputs.
 */
export abstract class OrigamiAccordionItemOptions {
  /** The value this item selects in its Accordion; it is also the item's Collection value. */
  abstract readonly value: Signal<string>;
  /** Blocks this item's user activation and native reveal requests, combined with the root's disabled policy. */
  abstract readonly disabled: Signal<boolean>;
  /** Collapsed hiding policy of the item's Panel; `until-found` is a progressive enhancement without a polyfill. */
  abstract readonly hiding: Signal<OrigamiCollapsibleHiding>;

  /**
   * Replaces item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionItemOptions> | AbstractType<OrigamiAccordionItemOptions>,
  ): Provider {
    return { provide: OrigamiAccordionItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, disabled and hiding.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiAccordionItemOptions): Provider {
    return { provide: OrigamiAccordionItemOptions, useFactory: factory };
  }
}

@Service({ autoProvided: false })
export class AccordionItemContext {
  readonly #root = inject(AccordionContext);
  readonly #item = injectDeferred(OrigamiCollectionItemOptions);
  readonly #collapsible = injectDeferred(OrigamiCollapsibleOptions);
  #destroyed = false;

  readonly disabled = computed(() => this.#collapsible().disabled());
  readonly locked = computed(() => this.#root.locked(this.#item().value()));
  readonly expanded = linkedSignal(() => this.#root.selected(this.#item().value()), {
    set: (expanded) => {
      if (!this.#destroyed && !this.disabled()) {
        this.#root.request(this.#item().value(), expanded);
      }
    },
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }
}

/**
 * Composes Collection Item and Collapsible under the nearest Accordion root; orphans fail DI.
 * Expansion observes actual effective selection. Lower expansion writes route through the
 * concrete mode without optimistic local writes, so synchronous selection/output reentry
 * is reflected on the next read. Lower Options adapters resolve `OrigamiAccordionItemOptions`
 * after construction rather than injecting this directive. Replacing public Collection Item
 * Options remains authoritative for the observed/selected item value.
 * Caller-scoped lower registration handles unmount/remount.
 */
@Directive({
  selector: "[ogAccordionItem]",
  exportAs: "ogAccordionItem",
  hostDirectives: [OrigamiCollectionItem, OrigamiCollapsible],
  providers: [
    AccordionItemContext,
    OrigamiAccordionItemOptions.provideExisting(() => OrigamiAccordionItem),
    OrigamiCollectionItemOptions.provideFactory(() => inject(OrigamiAccordionItemOptions)),
    OrigamiCollapsibleOptions.provideFactory(() => {
      const item = inject(OrigamiAccordionItemOptions);
      const root = inject(AccordionContext);

      return {
        expanded: inject(AccordionItemContext).expanded,
        disabled: computed(() => root.disabled() || item.disabled()),
        hiding: item.hiding,
      };
    }),
  ],
})
export class OrigamiAccordionItem implements OrigamiAccordionItemOptions {
  /** Own value input, default a generated value that hydration doesn't keep. Explicit distinct domain values provide persistent independent selection. Replaced Options supply the effective value. */
  readonly value = input(injectUniqueValue("accordion-item"));
  /** Own disabled input, default false with boolean-attribute coercion; combined reactively with root disabled for click/native reveal requests. Replaced Options supply the effective policy. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own collapsed hiding input, default hidden; inherits Presence exit retention and progressive until-found behavior. Replaced Options supply the effective policy. */
  readonly hiding = input<OrigamiCollapsibleHiding>("hidden");
  /**
   * This item's readonly observation, from its composed Collapsible: `expanded` follows the
   * root's actual selection of the item's value, and `disabled` is the item's effective disabled
   * state, the root's or its own.
   */
  readonly state = inject(OrigamiCollapsibleState);

  /** Validates the nearest Accordion owner synchronously, without resolving aliased Options during construction. */
  constructor() {
    inject(AccordionItemContext);
  }
}

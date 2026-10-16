import {
  DestroyRef,
  Directive,
  InjectionToken,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import type { Signal } from "@angular/core";
import { OrigamiCollectionItem, OrigamiCollectionItemOptions } from "@loozo/origami-ui/collection";
import { OrigamiCollapsible, OrigamiCollapsibleOptions } from "@loozo/origami-ui/collapsible";
import type { OrigamiCollapsibleHiding } from "@loozo/origami-ui/collapsible";
import { injectDeferred, injectUniqueValue } from "@loozo/origami-ui/utils";
import { AccordionContext } from "./accordion";

/** Private upper Item configuration, aliased after construction; not an application authoring API. */
const accordionItemConfiguration = new InjectionToken<{
  readonly value: Signal<string>;
  readonly disabled: Signal<boolean>;
  readonly hiding: Signal<OrigamiCollapsibleHiding>;
}>("Accordion Item configuration");

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
 * is reflected on the next read. Lower Options adapters resolve private typed Item
 * configuration after construction rather than injecting this directive. Replacing public
 * Collection Item Options remains authoritative for the observed/selected item value.
 * Caller-scoped lower registration handles unmount/remount.
 */
@Directive({
  selector: "[ogAccordionItem]",
  exportAs: "ogAccordionItem",
  hostDirectives: [OrigamiCollectionItem, OrigamiCollapsible],
  providers: [
    AccordionItemContext,
    { provide: accordionItemConfiguration, useExisting: forwardRef(() => OrigamiAccordionItem) },
    OrigamiCollectionItemOptions.provideFactory(() => inject(accordionItemConfiguration)),
    OrigamiCollapsibleOptions.provideFactory(() => {
      const item = inject(accordionItemConfiguration);
      const root = inject(AccordionContext);

      return {
        expanded: inject(AccordionItemContext).expanded,
        disabled: computed(() => root.disabled() || item.disabled()),
        hiding: item.hiding,
      };
    }),
  ],
})
export class OrigamiAccordionItem implements OrigamiCollectionItemOptions {
  /** Own value input, default a generated value that hydration doesn't keep. Explicit distinct domain values provide persistent independent selection. */
  readonly value = input(injectUniqueValue("accordion-item"));
  /** Own disabled input, default false with boolean-attribute coercion; combined reactively with root disabled for click/native reveal requests. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own collapsed hiding input, default hidden; inherits Presence exit retention and progressive until-found behavior. */
  readonly hiding = input<OrigamiCollapsibleHiding>("hidden");

  /** Validates the nearest Accordion owner synchronously, without resolving aliased Options during construction. */
  constructor() {
    inject(AccordionItemContext);
  }
}

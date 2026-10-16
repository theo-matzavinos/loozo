import {
  Directive,
  InjectionToken,
  Service,
  booleanAttribute,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { ɵrequestMultipleSelection } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  OrigamiAccordionOptions,
  OrigamiAccordionState,
  Selection,
  ɵOrigamiAccordionRoot,
} from "./accordion";

const multipleReplacement = new InjectionToken<OrigamiAccordionMultipleOptions>(
  "Accordion Multiple replacement",
);

/**
 * Effective Multiple configuration; it does not contain Single's collapsible property.
 * Helper provider arrays replace configuration locally, independent of co-matched directive import order.
 */
export abstract class OrigamiAccordionMultipleOptions {
  /** Writable readonly-array selection, default empty. Unknown values/order persist; user toggles allocate new arrays. */
  abstract readonly value: WritableSignal<readonly string[]>;
  /** Root user-request disabled policy, default false; external selection writes remain authoritative. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces all Multiple configuration with an existing provider.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array resolved after construction.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiAccordionMultipleOptions>
      | AbstractType<OrigamiAccordionMultipleOptions>,
  ): Provider[] {
    return [
      { provide: multipleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * Replaces all Multiple configuration without merging unused defaults.
   * @param factory - Injection-context factory supplying value and disabled signals.
   * @returns A local replacement-and-alias provider array. Ordinary writable signals do not emit an unused root model output.
   */
  static provideFactory(factory: () => OrigamiAccordionMultipleOptions): Provider[] {
    return [
      { provide: multipleReplacement, useFactory: factory },
      { provide: OrigamiAccordionMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only Multiple default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local array holding one Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(type: () => Type<OrigamiAccordionMultipleOptions>): Provider[] {
    return [
      {
        provide: OrigamiAccordionMultipleOptions,
        useFactory: () => {
          const replacement = inject(multipleReplacement, {
            self: true,
            optional: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject<OrigamiAccordionMultipleOptions>(forwardRef(type));
        },
      },
    ];
  }
}

@Service({ autoProvided: false })
class MultipleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiAccordionMultipleOptions);

  selected(value: string): boolean {
    return this.#options().value().includes(value);
  }

  locked(): boolean {
    return false;
  }

  request(value: string, expanded: boolean): void {
    ɵrequestMultipleSelection(this.#options().value, value, expanded);
  }
}

/**
 * Multiple-selection root. User toggles create new arrays, preserve other values/order and
 * never mutate the caller's array. Unmounted selections persist. No roles, headings, arrow
 * navigation or roving tabindex are supplied; consumers own those domain semantics.
 */
@Directive({
  selector: "[ogAccordionMultiple]",
  exportAs: "ogAccordionMultiple",
  hostDirectives: [ɵOrigamiAccordionRoot],
  providers: [
    MultipleSelection,
    { provide: Selection, useExisting: MultipleSelection },
    OrigamiAccordionMultipleOptions.ɵprovideDefault(() => OrigamiAccordionMultiple),
    OrigamiAccordionOptions.ɵprovideDefault(() => OrigamiAccordionMultipleOptions),
  ],
})
export class OrigamiAccordionMultiple implements OrigamiAccordionMultipleOptions {
  /** Own readonly-array model, default empty; valueChange emits accepted writes once. Substituted writable signals supply effective selection instead. */
  readonly value = model<readonly string[]>([]);
  /** Own root disabled input, default false with boolean-attribute coercion. Does not block authoritative external selection writes. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Shared readonly nearest-root item order and effective disabled observation. */
  readonly state = inject(OrigamiAccordionState);
}

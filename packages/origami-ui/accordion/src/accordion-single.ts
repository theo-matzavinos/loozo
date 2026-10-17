import {
  Directive,
  Service,
  booleanAttribute,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { ɵrequestSingleSelection } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  OrigamiAccordionOptions,
  OrigamiAccordionState,
  Selection,
  ɵOrigamiAccordionRoot,
} from "./accordion";

/**
 * Effective Single configuration. Unknown values remain authoritative and are never auto-normalized.
 * Helper providers replace configuration locally.
 */
export abstract class OrigamiAccordionSingleOptions {
  /** Writable nullable selected value, default null. Ordinary writable signals are valid replacements. */
  abstract readonly value: WritableSignal<string | null>;
  /** Root user-request disabled policy, default false; external selection writes remain authoritative. */
  abstract readonly disabled: Signal<boolean>;
  /** Whether a selected enabled item can request clearing to null; default false. */
  abstract readonly collapsible: Signal<boolean>;

  /**
   * Replaces all Single configuration with a compatible existing provider.
   * @param type - Concrete or abstract class supplier; forward references are supported.
   * @returns A local provider, resolved after construction.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionSingleOptions> | AbstractType<OrigamiAccordionSingleOptions>,
  ): Provider {
    return { provide: OrigamiAccordionSingleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Single configuration with factory-owned signals.
   * @param factory - Runs in injection context and must supply value, disabled and collapsible.
   * @returns A local provider; writing replacement signals does not fabricate unused model outputs.
   */
  static provideFactory(factory: () => OrigamiAccordionSingleOptions): Provider {
    return { provide: OrigamiAccordionSingleOptions, useFactory: factory };
  }
}

@Service({ autoProvided: false })
class SingleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiAccordionSingleOptions);

  selected(value: string): boolean {
    return this.#options().value() === value;
  }

  locked(value: string): boolean {
    return this.selected(value) && !this.#options().collapsible();
  }

  request(value: string, expanded: boolean): void {
    const options = this.#options();

    ɵrequestSingleSelection(options.value, value, expanded, options.collapsible());
  }
}

/**
 * Single-selection root with null default and optional clearing. Unknown external values
 * persist; no first-item selection or pruning is performed. Native buttons supply activation;
 * consumers own headings, panel roles, styling and any additional navigation semantics.
 *
 * @example
 * ```html
 * <section ogAccordionSingle [(value)]="selected" [collapsible]="true">
 *   <article ogAccordionItem value="billing">
 *     <h2><button ogAccordionTrigger>Billing</button></h2>
 *     <div ogAccordionPanel role="region">Details</div>
 *   </article>
 * </section>
 * ```
 */
@Directive({
  selector: "[ogAccordionSingle]",
  exportAs: "ogAccordionSingle",
  hostDirectives: [ɵOrigamiAccordionRoot],
  providers: [
    SingleSelection,
    { provide: Selection, useExisting: SingleSelection },
    OrigamiAccordionSingleOptions.provideExisting(() => OrigamiAccordionSingle),
    OrigamiAccordionOptions.provideExisting(() => OrigamiAccordionSingleOptions),
  ],
})
export class OrigamiAccordionSingle implements OrigamiAccordionSingleOptions {
  /** Own selection model, default null; valueChange emits accepted model writes. Substituted factory signals do not fabricate this output. */
  readonly value = model<string | null>(null);
  /** Own root disabled input, default false with boolean-attribute coercion. Effective substituted Options govern behavior instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Own clearing-policy input, default false with boolean-attribute coercion; replaced Options
   * supply effective policy instead. A selected non-collapsible Trigger is aria-disabled but
   * remains natively enabled/focusable unless root or item disabled state also applies.
   */
  readonly collapsible = input(false, { transform: booleanAttribute });
  /** Shared readonly nearest-root item order and effective disabled observation. */
  readonly state = inject(OrigamiAccordionState);
}

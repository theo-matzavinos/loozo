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
import {
  OrigamiCollection,
  ɵOrigamiRovingFocus,
  ɵrequestMultipleSelection,
} from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  OrigamiToggleGroupState,
  Selection,
  ToggleGroupContext,
  groupConfiguration,
} from "./toggle-group";
import type { OrigamiToggleGroupOrientation } from "./toggle-group";

const multipleReplacement = new InjectionToken<OrigamiToggleGroupMultipleOptions>(
  "Toggle Group Multiple replacement",
);

/** Effective Multiple configuration; it has no Single `deselectable` policy. */
export abstract class OrigamiToggleGroupMultipleOptions {
  /**
   * Writable readonly-array pressed values; the direct directive model defaults to empty. Values
   * no item has persist in order; user activation writes new arrays. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<readonly string[]>;
  /** Blocks every item's user activation and removes the tab stop, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis; default `horizontal`. Has no effect inside a Toolbar, whose orientation applies. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;

  /**
   * Replaces Multiple Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
  ): Provider[] {
    return [
      { provide: multipleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToggleGroupMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * Replaces all Multiple Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, disabled and orientation.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleGroupMultipleOptions): Provider[] {
    return [
      { provide: multipleReplacement, useFactory: factory },
      { provide: OrigamiToggleGroupMultipleOptions, useExisting: multipleReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToggleGroupMultipleOptions,
        useFactory: () => {
          const replacement = inject(multipleReplacement, {
            optional: true,
            self: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject(forwardRef(type));
        },
      },
    ];
  }
}

@Service({ autoProvided: false })
class MultipleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiToggleGroupMultipleOptions);

  selected(value: string): boolean {
    return this.#options().value().includes(value);
  }

  request(value: string, pressed: boolean): void {
    ɵrequestMultipleSelection(this.#options().value, value, pressed);
  }
}

/**
 * Multiple-pressed Toggle Group root: each item adds or removes its value. User activation
 * writes a new array that keeps every other value, including values no item has, in order, and
 * never mutates the caller's array; removing an item never prunes. Composes Collection so focus
 * follows rendered DOM order; the model is never written without user action. Static
 * `role="group"` (a consumer's static `role` overrides it), `data-orientation` and
 * `data-disabled` reflect effective Options; there is no `aria-orientation`. Consumers own the
 * accessible name, item labels and styling. Inside an `ogToolbar` the group joins the Toolbar: its
 * items share the Toolbar's single tab stop and arrow order, and the effective orientation is the
 * Toolbar's.
 *
 * @example
 * ```html
 * <div ogToggleGroupMultiple [(value)]="marks" aria-label="Text formatting">
 *   <button ogToggleGroupItem value="bold">Bold</button>
 *   <button ogToggleGroupItem value="italic">Italic</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToggleGroupMultiple]",
  exportAs: "ogToggleGroupMultiple",
  hostDirectives: [OrigamiCollection],
  providers: [
    ToggleGroupContext,
    OrigamiToggleGroupState,
    ɵOrigamiRovingFocus,
    MultipleSelection,
    { provide: Selection, useExisting: MultipleSelection },
    OrigamiToggleGroupMultipleOptions.ɵprovideDefault(() => OrigamiToggleGroupMultiple),
    { provide: groupConfiguration, useExisting: OrigamiToggleGroupMultipleOptions },
  ],
  host: {
    role: "group",
    "[attr.data-orientation]": "effectiveOrientation()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class OrigamiToggleGroupMultiple implements OrigamiToggleGroupMultipleOptions {
  /**
   * Own readonly-array model, default empty; `valueChange` emits user activations written to
   * this model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<readonly string[]>([]);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; replaced Options supply effective orientation instead. */
  readonly orientation = input<OrigamiToggleGroupOrientation>("horizontal");
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToggleGroupState);

  readonly #context = inject(ToggleGroupContext);

  /** @internal Effective orientation host marker. */
  protected readonly effectiveOrientation = this.#context.orientation;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
}

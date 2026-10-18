import {
  Directive,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { ɵrequestMultipleSelection } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  OrigamiToggleGroupState,
  ownRovingFocus,
  ɵOrigamiToggleGroupRoot,
  ToggleGroupRootOptions,
} from "./toggle-group";
import type { OrigamiToggleGroupOrientation } from "./toggle-group";

/** Effective Multiple configuration; it has no Single `deselectable` policy. */
export abstract class OrigamiToggleGroupMultipleOptions {
  /**
   * Writable readonly-array pressed values; the direct directive model defaults to empty. Values
   * no item has persist in order; user activation writes new arrays. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<readonly string[]>;
  /**
   * Blocks every item's user activation, not external configuration writes; default false. It
   * removes the group's tab stop unless an item is `focusableWhenDisabled`; then the focused such
   * item, else the first, keeps it. In a Toolbar group, only such items stay tab-stop candidates.
   */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis; default `horizontal`. Has no effect on a Toolbar Toggle Group, whose Toolbar's orientation applies. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;

  /**
   * Replaces Multiple Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
  ): Provider {
    return { provide: OrigamiToggleGroupMultipleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Multiple Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value, disabled and orientation.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleGroupMultipleOptions): Provider {
    return { provide: OrigamiToggleGroupMultipleOptions, useFactory: factory };
  }

  /**
   * @internal Providers for a Multiple root directive that composes `ɵOrigamiToggleGroupRoot`:
   * its Options default and the root Options derived from these Options.
   * @param type - Deferred same-host directive supplying the default Options.
   * @param orientation - Supplies the effective axis in the root's injection context; omitted,
   *   these Options' orientation applies.
   * @returns Local providers for the Multiple root directive.
   */
  static ɵprovideRoot(
    type: () =>
      | Type<OrigamiToggleGroupMultipleOptions>
      | AbstractType<OrigamiToggleGroupMultipleOptions>,
    orientation?: () => Signal<OrigamiToggleGroupOrientation>,
  ): Provider[] {
    return [
      OrigamiToggleGroupMultipleOptions.provideExisting(type),
      ToggleGroupRootOptions.provideFactory(() => {
        const options = injectDeferred(OrigamiToggleGroupMultipleOptions);
        let effectiveOrientation: Signal<OrigamiToggleGroupOrientation> = computed(() =>
          options().orientation(),
        );

        if (orientation !== undefined) {
          effectiveOrientation = orientation();
        }

        return {
          disabled: computed(() => options().disabled()),
          orientation: effectiveOrientation,
          values: computed(() => options().value()),
          request: (value, pressed) => {
            ɵrequestMultipleSelection(options().value, value, pressed);
          },
        };
      }),
    ];
  }
}

/**
 * Multiple-pressed Toggle Group root: each item adds or removes its value. User activation
 * writes a new array that keeps every other value, including values no item has, in order, and
 * never mutates the caller's array; removing an item never prunes. Its items share one tab
 * stop, held by the focused item, else the first pressed in DOM order, else the first, and arrow
 * keys follow rendered DOM order; the model is never written without user action. Static
 * `role="group"` (a consumer's static `role` overrides it), `data-orientation` and
 * `data-disabled` reflect effective Options; there is no `aria-orientation`. Consumers own the
 * accessible name, item labels and styling. Inside an `ogToolbar` it keeps its own tab stop; to
 * share the Toolbar's, use `OrigamiToolbarToggleGroupMultiple` from `@loozo/origami-ui/toolbar`.
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
  hostDirectives: [ɵOrigamiToggleGroupRoot],
  providers: [
    OrigamiToggleGroupMultipleOptions.ɵprovideRoot(() => OrigamiToggleGroupMultiple),
    ownRovingFocus,
  ],
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
}

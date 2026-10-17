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
import { ɵrequestSingleSelection } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  OrigamiToggleGroupState,
  ownRovingFocus,
  ɵOrigamiToggleGroupRoot,
  ToggleGroupRootOptions,
} from "./toggle-group";
import type { OrigamiToggleGroupOrientation } from "./toggle-group";

/** Effective Single configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToggleGroupSingleOptions {
  /**
   * Writable pressed value; the direct directive model defaults to null. Null or a value no item
   * has presses nothing and is never normalized. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /** Blocks every item's user activation and removes the tab stop, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis; default `horizontal`. Has no effect on a Toolbar Toggle Group, whose Toolbar's orientation applies. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;
  /** Whether activating the pressed item clears the value to null; default false, when it writes nothing. */
  abstract readonly deselectable: Signal<boolean>;

  /**
   * Replaces Single Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiToggleGroupSingleOptions>
      | AbstractType<OrigamiToggleGroupSingleOptions>,
  ): Provider {
    return { provide: OrigamiToggleGroupSingleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Single Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply all four required signals.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleGroupSingleOptions): Provider {
    return { provide: OrigamiToggleGroupSingleOptions, useFactory: factory };
  }

  /**
   * @internal Providers for a Single root directive that composes `ɵOrigamiToggleGroupRoot`:
   * its Options default and the root Options derived from these Options.
   * @param type - Deferred same-host directive supplying the default Options.
   * @param orientation - Supplies the effective axis in the root's injection context; omitted,
   *   these Options' orientation applies.
   * @returns Local providers for the Single root directive.
   */
  static ɵprovideRoot(
    type: () =>
      | Type<OrigamiToggleGroupSingleOptions>
      | AbstractType<OrigamiToggleGroupSingleOptions>,
    orientation?: () => Signal<OrigamiToggleGroupOrientation>,
  ): Provider[] {
    return [
      OrigamiToggleGroupSingleOptions.provideExisting(type),
      ToggleGroupRootOptions.provideFactory(() => {
        const options = injectDeferred(OrigamiToggleGroupSingleOptions);
        let effectiveOrientation: Signal<OrigamiToggleGroupOrientation> = computed(() =>
          options().orientation(),
        );

        if (orientation !== undefined) {
          effectiveOrientation = orientation();
        }

        return {
          disabled: computed(() => options().disabled()),
          orientation: effectiveOrientation,
          values: computed(() => {
            const value = options().value();

            if (value === null) {
              return [];
            }

            return [value];
          }),
          request: (value, pressed) => {
            const current = options();

            ɵrequestSingleSelection(current.value, value, pressed, current.deselectable());
          },
        };
      }),
    ];
  }
}

/**
 * Single-pressed Toggle Group root: at most one item is pressed, and with `deselectable` the
 * pressed item can clear the value to null. Its items share one tab stop, held by the focused
 * item, else the first pressed, else the first, and arrow keys follow rendered DOM order. While
 * the value is null or no mounted item has it, nothing is pressed; the model is never written
 * without user action. Static `role="group"` (a consumer's static `role` overrides it),
 * `data-orientation` and `data-disabled` reflect effective Options; there is no
 * `aria-orientation`, which ARIA does not allow on `group`. Consumers own the accessible name,
 * item labels and styling. For radio semantics, where selection follows focus, use
 * `OrigamiRadioGroup`. Inside an `ogToolbar` it keeps its own tab stop; to share the Toolbar's,
 * use `OrigamiToolbarToggleGroupSingle` from `@loozo/origami-ui/toolbar`.
 *
 * @example
 * ```html
 * <div ogToggleGroupSingle [(value)]="alignment" aria-label="Text alignment">
 *   <button ogToggleGroupItem value="start">Start</button>
 *   <button ogToggleGroupItem value="center">Center</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogToggleGroupSingle]",
  exportAs: "ogToggleGroupSingle",
  hostDirectives: [ɵOrigamiToggleGroupRoot],
  providers: [
    OrigamiToggleGroupSingleOptions.ɵprovideRoot(() => OrigamiToggleGroupSingle),
    ownRovingFocus,
  ],
})
export class OrigamiToggleGroupSingle implements OrigamiToggleGroupSingleOptions {
  /**
   * Own pressed-value model, default null; `valueChange` emits user activations written to this
   * model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own orientation input, default `horizontal`; replaced Options supply effective orientation instead. */
  readonly orientation = input<OrigamiToggleGroupOrientation>("horizontal");
  /**
   * Own clearing-policy input, default false with boolean-attribute coercion; replaced Options
   * supply effective policy instead. A pressed item that cannot clear stays an ordinary enabled
   * pressed button: activating it writes and emits nothing.
   */
  readonly deselectable = input(false, { transform: booleanAttribute });
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiToggleGroupState);
}

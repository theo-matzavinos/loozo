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
  ɵrequestSingleSelection,
} from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  OrigamiToggleGroupState,
  Selection,
  ToggleGroupContext,
  groupConfiguration,
} from "./toggle-group";
import type { OrigamiToggleGroupOrientation } from "./toggle-group";

// Module-private so Options retain structural compatibility in packaged declarations.
const singleReplacement = new InjectionToken<OrigamiToggleGroupSingleOptions>(
  "Toggle Group Single replacement",
);

/** Effective Single configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiToggleGroupSingleOptions {
  /**
   * Writable pressed value; the direct directive model defaults to null. Null or a value no item
   * has presses nothing and is never normalized. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /** Blocks every item's user activation and removes the tab stop, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Arrow-key axis; default `horizontal`. Has no effect inside a Toolbar, whose orientation applies. */
  abstract readonly orientation: Signal<OrigamiToggleGroupOrientation>;
  /** Whether activating the pressed item clears the value to null; default false, when it writes nothing. */
  abstract readonly deselectable: Signal<boolean>;

  /**
   * Replaces Single Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiToggleGroupSingleOptions>
      | AbstractType<OrigamiToggleGroupSingleOptions>,
  ): Provider[] {
    return [
      { provide: singleReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiToggleGroupSingleOptions, useExisting: singleReplacement },
    ];
  }

  /**
   * Replaces all Single Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply all four required signals.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiToggleGroupSingleOptions): Provider[] {
    return [
      { provide: singleReplacement, useFactory: factory },
      { provide: OrigamiToggleGroupSingleOptions, useExisting: singleReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () =>
      | Type<OrigamiToggleGroupSingleOptions>
      | AbstractType<OrigamiToggleGroupSingleOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiToggleGroupSingleOptions,
        useFactory: () => {
          const replacement = inject(singleReplacement, {
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
class SingleSelection implements Selection {
  readonly #options = injectDeferred(OrigamiToggleGroupSingleOptions);

  selected(value: string): boolean {
    return this.#options().value() === value;
  }

  request(value: string, pressed: boolean): void {
    const options = this.#options();

    ɵrequestSingleSelection(options.value, value, pressed, options.deselectable());
  }
}

/**
 * Single-pressed Toggle Group root: at most one item is pressed, and with `deselectable` the
 * pressed item can clear the value to null. Composes Collection so focus follows rendered DOM
 * order. While the value is null or no mounted item has it, nothing is pressed; the model is
 * never written without user action. Static `role="group"` (a consumer's static `role`
 * overrides it), `data-orientation` and `data-disabled` reflect effective Options; there is no
 * `aria-orientation`, which ARIA does not allow on `group`. Consumers own the accessible name,
 * item labels and styling. For radio semantics, where selection follows focus, use
 * `OrigamiRadioGroup`. Inside an `ogToolbar` the group joins the Toolbar: its items share the
 * Toolbar's single tab stop and arrow order, and the effective orientation is the Toolbar's.
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
  hostDirectives: [OrigamiCollection],
  providers: [
    ToggleGroupContext,
    OrigamiToggleGroupState,
    ɵOrigamiRovingFocus,
    SingleSelection,
    { provide: Selection, useExisting: SingleSelection },
    OrigamiToggleGroupSingleOptions.ɵprovideDefault(() => OrigamiToggleGroupSingle),
    { provide: groupConfiguration, useExisting: OrigamiToggleGroupSingleOptions },
  ],
  host: {
    role: "group",
    "[attr.data-orientation]": "effectiveOrientation()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
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

  readonly #context = inject(ToggleGroupContext);

  /** @internal Effective orientation host marker. */
  protected readonly effectiveOrientation = this.#context.orientation;
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = this.#context.disabledAttribute;
}

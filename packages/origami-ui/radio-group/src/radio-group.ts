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
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import {
  OrigamiCollection,
  ɵOrigamiRovingFocus,
  ɵOrigamiRovingFocusScope,
  ɵrequestSingleSelection,
} from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";

// Module-private so Options retain structural compatibility in packaged declarations.
const groupReplacement = new InjectionToken<OrigamiRadioGroupOptions>("Radio Group replacement");

/** Effective root configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiRadioGroupOptions {
  /**
   * Writable checked value; the direct directive model defaults to null. Null or a value no item
   * has checks nothing and is never normalized. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<string | null>;
  /** Blocks every item's user selection and removes the tab stop, not external configuration writes; default false. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces Radio Group Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers. Behavior resolves after construction, independent of direct co-match import order.
   */
  static provideExisting(
    type: () => Type<OrigamiRadioGroupOptions> | AbstractType<OrigamiRadioGroupOptions>,
  ): Provider[] {
    return [
      { provide: groupReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiRadioGroupOptions, useExisting: groupReplacement },
    ];
  }

  /**
   * Replaces all Radio Group Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value and disabled.
   * @returns Local replacement and public-alias providers. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiRadioGroupOptions): Provider[] {
    return [
      { provide: groupReplacement, useFactory: factory },
      { provide: OrigamiRadioGroupOptions, useExisting: groupReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiRadioGroupOptions> | AbstractType<OrigamiRadioGroupOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiRadioGroupOptions,
        useFactory: () => {
          const replacement = inject(groupReplacement, {
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
export class RadioGroupContext {
  readonly #options = injectDeferred(OrigamiRadioGroupOptions);
  readonly #scope = inject(ɵOrigamiRovingFocusScope, { optional: true });
  #destroyed = false;

  readonly value = computed(() => this.#options().value());
  readonly disabled = computed(() => this.#options().disabled());
  /** Arrow keys: the enclosing Toolbar's orientation while joined, otherwise all four arrows. */
  readonly axis = computed<"horizontal" | "vertical" | "both">(() => {
    if (this.#scope !== null) {
      return this.#scope.orientation();
    }

    return "both";
  });

  readonly disabledAttribute = computed(() => {
    if (this.disabled()) {
      return "";
    }

    return null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * Registers the calling item, from its injection context, with the enclosing Toolbar's roving
   * focus, where it is never preferred and a move never checks, or otherwise with the group's own.
   */
  registerFocus(item: {
    readonly disabled: Signal<boolean>;
    readonly preferred: Signal<boolean>;
    readonly navigated: () => void;
  }) {
    if (this.#scope !== null) {
      return this.#scope.focus.join({ disabled: item.disabled, navigated: () => {} });
    }

    return inject(ɵOrigamiRovingFocus).register(item);
  }

  /** A user check request; the caller has already applied its own disabled policy. There is no user unchecking. */
  select(value: string): void {
    if (!this.#destroyed && !this.disabled()) {
      ɵrequestSingleSelection(this.#options().value, value, true, false);
    }
  }
}

/** Locally provided readonly facade for the nearest Radio Group root; nested roots have independent owners. */
@Service({ autoProvided: false })
export class OrigamiRadioGroupState {
  readonly #context = inject(RadioGroupContext);

  /** Effective checked value, including null and values no mounted item has. No writable alias is exposed. */
  readonly value: Signal<string | null> = this.#context.value;
  /** Effective root disabled policy. External Options/model writes remain authoritative while disabled. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

/**
 * Radio Group root: at most one item is checked, and the user can check an item but never
 * uncheck one. Composes Collection so focus follows rendered DOM order. While the value is null
 * or no mounted item has it, nothing is checked; the model is never written without user action.
 * Static `role="radiogroup"` (a consumer's static `role` overrides it); `data-disabled` reflects
 * effective Options. It has no orientation: all four arrow keys move. It binds no
 * `aria-orientation`, `aria-required` or `aria-disabled`; consumers may write them statically,
 * and own the accessible name, item labels, layout and styling. Inside an `ogToolbar` the group
 * joins the Toolbar: its items share the Toolbar's single tab stop and arrow order, arrows follow
 * the Toolbar's orientation and only move focus. It is not a form control: no `name`, form value,
 * `required` or validity.
 *
 * @example
 * ```html
 * <div ogRadioGroup [(value)]="speed" aria-label="Shipping speed">
 *   <button ogRadioGroupItem value="standard">Standard</button>
 *   <button ogRadioGroupItem value="express">Express</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogRadioGroup]",
  exportAs: "ogRadioGroup",
  hostDirectives: [OrigamiCollection],
  providers: [
    RadioGroupContext,
    OrigamiRadioGroupState,
    ɵOrigamiRovingFocus,
    OrigamiRadioGroupOptions.ɵprovideDefault(() => OrigamiRadioGroup),
  ],
  host: {
    role: "radiogroup",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class OrigamiRadioGroup implements OrigamiRadioGroupOptions {
  /**
   * Own checked-value model, default null; `valueChange` emits user selections written to this
   * model. Replaced Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective Options observation, shared with its descendants. */
  readonly state = inject(OrigamiRadioGroupState);

  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = inject(RadioGroupContext).disabledAttribute;
}

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
  ɵOrigamiRovingFocusContext,
  ɵOrigamiRovingFocusOptions,
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
  #destroyed = false;

  readonly value = computed(() => this.#options().value());
  readonly disabled = computed(() => this.#options().disabled());

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
    // Only a standalone group provides its own roving focus; there a keyboard move checks.
    inject(ɵOrigamiRovingFocusContext, { self: true, optional: true })?.navigations.subscribe(
      (value) => {
        this.select(value);
      },
    );
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
 * @internal Package-private shared Radio Group root, composed by `OrigamiRadioGroup` and
 * `OrigamiToolbarRadioGroup`, each of which supplies `OrigamiRadioGroupOptions`. It provides the
 * Context and State its items read. Static `role="radiogroup"` (a consumer's static `role`
 * overrides it); `data-disabled` reflects effective Options. Not an application API.
 */
@Directive({
  providers: [RadioGroupContext, OrigamiRadioGroupState],
  host: {
    role: "radiogroup",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class ɵOrigamiRadioGroupRoot {
  /** @internal Readonly disabled host marker. */
  protected readonly disabledAttribute = inject(RadioGroupContext).disabledAttribute;
}

/**
 * Radio Group root: at most one item is checked, and the user can check an item but never
 * uncheck one. Its items share one tab stop, held by the focused item, else the checked one,
 * else the first, and all four arrow keys move along rendered DOM order. While the value is null
 * or no mounted item has it, nothing is checked; the model is never written without user action.
 * Static `role="radiogroup"` (a consumer's static `role` overrides it); `data-disabled` reflects
 * effective Options. It has no orientation. It binds no `aria-orientation`, `aria-required` or
 * `aria-disabled`; consumers may write them statically, and own the accessible name, item
 * labels, layout and styling. Inside an `ogToolbar` it keeps its own tab stop; to share the
 * Toolbar's, use `OrigamiToolbarRadioGroup` from `@loozo/origami-ui/toolbar`. It is not a form
 * control: no `name`, form value, `required` or validity.
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
  hostDirectives: [ɵOrigamiRadioGroupRoot],
  providers: [
    OrigamiRadioGroupOptions.ɵprovideDefault(() => OrigamiRadioGroup),
    ɵOrigamiRovingFocusContext,
    ɵOrigamiRovingFocusOptions.provideFactory(() => {
      const context = inject(RadioGroupContext);

      return {
        orientation: computed<"both">(() => "both"),
        preferred: computed(() => {
          const value = context.value();

          if (value === null) {
            return [];
          }

          return [value];
        }),
      };
    }),
  ],
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
}

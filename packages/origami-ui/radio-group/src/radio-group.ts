import {
  DestroyRef,
  Directive,
  ElementRef,
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
  OrigamiCollectionItem,
  OrigamiCollectionItemOptions,
  ɵOrigamiRovingFocus,
  ɵOrigamiRovingFocusScope,
  ɵrequestSingleSelection,
} from "@loozo/origami-ui/collection";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

// Module-private so Options retain structural compatibility in packaged declarations.
const groupReplacement = new InjectionToken<OrigamiRadioGroupOptions>("Radio Group replacement");
const itemReplacement = new InjectionToken<OrigamiRadioGroupItemOptions>(
  "Radio Group Item replacement",
);

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

/**
 * Effective item configuration. It also drives the composed Collection Item, so replacing only
 * these Options sets the item's Collection value and roving order without lower Options. The
 * group reads every item's Options while rendering, so replacement Options must be readable as
 * soon as the item is constructed; a required input in a repeated item can be read before
 * Angular sets it (NG0950).
 */
export abstract class OrigamiRadioGroupItemOptions {
  /** The value this item checks in its group. */
  abstract readonly value: Signal<string>;
  /** Blocks this item's user selection and focus, combined with the root's disabled policy. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns Local replacement and public-alias providers; a directly matched item default cannot override this replacement.
   */
  static provideExisting(
    type: () => Type<OrigamiRadioGroupItemOptions> | AbstractType<OrigamiRadioGroupItemOptions>,
  ): Provider[] {
    return [
      { provide: itemReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiRadioGroupItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value and disabled.
   * @returns Local replacement and public-alias providers; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiRadioGroupItemOptions): Provider[] {
    return [
      { provide: itemReplacement, useFactory: factory },
      { provide: OrigamiRadioGroupItemOptions, useExisting: itemReplacement },
    ];
  }

  /**
   * @internal Primitive-only fallback; never imports parent replacement Options.
   * @param type - Deferred same-host directive, resolved only after construction.
   * @returns A one-provider local array preferring explicit replacement over directive defaults.
   */
  static ɵprovideDefault(
    type: () => Type<OrigamiRadioGroupItemOptions> | AbstractType<OrigamiRadioGroupItemOptions>,
  ): Provider[] {
    return [
      {
        provide: OrigamiRadioGroupItemOptions,
        useFactory: () => {
          const replacement = inject(itemReplacement, {
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
class RadioGroupContext {
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

/**
 * A native `type="button"` with `role="radio"` and always-present `aria-checked`, composed with
 * Collection Item. Click, Enter or Space focuses it and checks its value once if it is still
 * mounted and enabled after its focus handlers ran; checking the checked item writes nothing and
 * there is no unchecking. Arrow keys move focus among enabled items in DOM order, wrapping at the
 * ends: ArrowDown and ArrowRight to the next, ArrowUp and ArrowLeft to the previous, with
 * ArrowLeft and ArrowRight swapped in right-to-left text; Home and End move to the first and last.
 * The item a move focuses is checked if it is still mounted, enabled and focused after its focus
 * handlers ran; other focus never checks. One enabled item is the tab stop (`tabindex="0"`): the
 * focused one, else the first checked, else the first. Inside a Toolbar (but not inside Popover
 * Content within it) the item joins the Toolbar's roving focus instead: it shares the Toolbar's
 * tab stop and arrow order along its orientation, is never preferred, and moves never check.
 * Root or own disabled state sets native `disabled`, `aria-disabled` and `data-disabled` and
 * removes the item from navigation; a disabled checked item stays `aria-checked="true"`. If a
 * focused item is removed or disabled while focus has not moved elsewhere, focus moves to the new
 * tab stop without checking. Requires a nearest Radio Group root; values should be distinct within it.
 */
@Directive({
  selector: "button[ogRadioGroupItem]",
  hostDirectives: [OrigamiCollectionItem],
  providers: [
    OrigamiRadioGroupItemOptions.ɵprovideDefault(() => OrigamiRadioGroupItem),
    OrigamiCollectionItemOptions.provideFactory(() => inject(OrigamiRadioGroupItemOptions)),
  ],
  host: {
    role: "radio",
    type: "button",
    "[disabled]": "effectiveDisabled()",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-checked]": "checked()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-checked]": "checkedAttribute()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "activate()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiRadioGroupItem implements OrigamiRadioGroupItemOptions {
  /**
   * Own value input, default opaque hydration-stable generated identity; give each item an
   * explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueId("radio-group-item"));
  /** Own disabled input, default false with boolean-attribute coercion; combined with the root's disabled policy. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiRadioGroupItemOptions);
  readonly #context = inject(RadioGroupContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #destroyed = false;

  /** @internal Combined root and own disabled policy. */
  protected readonly effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );
  /** @internal Checked ARIA observation, always `true` or `false`. */
  protected readonly checked = computed(() => this.#context.value() === this.#options().value());

  readonly #focus = this.#context.registerFocus({
    disabled: this.effectiveDisabled,
    preferred: this.checked,
    navigated: () => {
      if (this.#selectable()) {
        this.#context.select(this.#options().value());
      }
    },
  });

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop()) {
      return "0";
    }

    return "-1";
  });

  /** @internal Disabled ARIA observation. */
  protected readonly disabledAria = computed(() => {
    if (this.effectiveDisabled()) {
      return "true";
    }

    return null;
  });

  /** @internal Checked host marker. */
  protected readonly checkedAttribute = computed(() => {
    if (this.checked()) {
      return "";
    }

    return null;
  });

  /** @internal Disabled host marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.effectiveDisabled()) {
      return "";
    }

    return null;
  });

  /** Resolves the nearest Radio Group root synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * @internal Live native activation request, obeying effective disabled Options. Not every
   * engine focuses a clicked button, so activation focuses this item to make it the roving
   * position; that focus never checks. Its focus handlers may remove or disable this item, so
   * the guard runs again once focus returns.
   */
  protected activate(): void {
    if (!this.#selectable()) {
      return;
    }

    this.#element.focus();

    if (!this.#selectable()) {
      return;
    }

    this.#context.select(this.#options().value());
  }

  /** @internal Arrow/Home/End navigation: all four arrows, or the Toolbar's axis while joined. */
  protected keydown(event: KeyboardEvent): void {
    this.#focus.keydown(event, this.#context.axis());
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected focused(): void {
    this.#focus.focus();
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected blurred(): void {
    this.#focus.blur();
  }

  /** Live activation guard: mounted and not disabled by the root or its own Options. */
  #selectable(): boolean {
    return !this.#destroyed && !this.effectiveDisabled();
  }
}

import { Directive, booleanAttribute, computed, forwardRef, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";

/**
 * Effective Button configuration, replaced as a whole rather than merged with unused defaults.
 * Every Origami button part composes `ogButton` and supplies these Options from its own effective
 * disabled state, its root's or its own, and its own `focusableWhenDisabled`.
 */
export abstract class OrigamiButtonOptions {
  /** Disables the button: `aria-disabled="true"` and `data-disabled`, plus native `disabled` unless `focusableWhenDisabled`; direct default false. */
  abstract readonly disabled: Signal<boolean>;
  /**
   * While the button is disabled, it stays focusable: `aria-disabled="true"` and `data-disabled`
   * without native `disabled`. The browser still dispatches its clicks, so the consumer's own
   * `(click)` listeners on the button still run; a composing Origami part still ignores the
   * activation. Direct default false.
   */
  abstract readonly focusableWhenDisabled: Signal<boolean>;

  /**
   * Replaces Button Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiButtonOptions> | AbstractType<OrigamiButtonOptions>,
  ): Provider {
    return { provide: OrigamiButtonOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Button Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `disabled` and
   *   `focusableWhenDisabled`.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiButtonOptions): Provider {
    return { provide: OrigamiButtonOptions, useFactory: factory };
  }
}

/**
 * A native button's disabled semantics: `type="button"`, and while disabled `aria-disabled="true"`,
 * empty `data-disabled` and native `disabled`, which `focusableWhenDisabled` leaves off so the
 * button keeps its place in the Tab order. The attributes are absent while enabled. It adds no
 * activation, keyboard handling or State: a natively disabled button receives no clicks, while a
 * focusable disabled one still runs the consumer's own `(click)` listeners, so a consumer handler
 * checks the disabled state itself.
 *
 * Every Origami button part composes it and is its sole owner: Toggle, ToggleGroup items, the
 * Collapsible, Accordion, Popover and Tabs Triggers, RadioGroup items and the Toolbar's controls.
 * Use `ogButton` only on a plain button: applying it next to one of them, or two of them to one
 * element, is unsupported. Angular silently shares one Button between them and only one part's
 * Options reach it. Use the Toolbar's variants, such as `ogToolbarToggle`, for a
 * control that is two of them.
 * @example
 * ```html
 * <button ogButton [disabled]="saving()" focusableWhenDisabled (click)="save()">Save</button>
 * ```
 */
@Directive({
  selector: "button[ogButton]",
  providers: [OrigamiButtonOptions.provideExisting(() => OrigamiButton)],
  host: {
    type: "button",
    "[disabled]": "nativeDisabled()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-disabled]": "disabledAttribute()",
  },
})
export class OrigamiButton implements OrigamiButtonOptions {
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own input keeping the disabled button focusable, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly focusableWhenDisabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiButtonOptions);

  /** @internal Native disabled host binding, absent while a disabled button stays focusable. */
  protected readonly nativeDisabled = computed(
    () => this.#options().disabled() && !this.#options().focusableWhenDisabled(),
  );
  /** @internal Disabled ARIA observation. */
  protected readonly disabledAria = computed(() => {
    if (this.#options().disabled()) {
      return "true";
    }

    return null;
  });
  /** @internal Disabled host marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.#options().disabled()) {
      return "";
    }

    return null;
  });
}

import {
  DestroyRef,
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { ɵOrigamiRovingFocusContext } from "@loozo/origami-ui/collection";
import { injectDeferred, injectUniqueValue } from "@loozo/origami-ui/utils";
import { RadioGroupContext } from "./radio-group";

/**
 * Effective item configuration. Other items read it only once the item has registered with the
 * roving focus in `ngOnInit`, after Angular set its inputs, so replacement Options may use
 * required inputs.
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
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiRadioGroupItemOptions> | AbstractType<OrigamiRadioGroupItemOptions>,
  ): Provider {
    return { provide: OrigamiRadioGroupItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value and disabled.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiRadioGroupItemOptions): Provider {
    return { provide: OrigamiRadioGroupItemOptions, useFactory: factory };
  }
}

/**
 * A native `type="button"` with `role="radio"` and always-present `aria-checked`. Click, Enter or Space focuses it and checks its value once if it is still
 * mounted and enabled after its focus handlers ran; checking the checked item writes nothing and
 * there is no unchecking. Arrow keys move focus among enabled items in DOM order, wrapping at the
 * ends: ArrowDown and ArrowRight to the next, ArrowUp and ArrowLeft to the previous, with
 * ArrowLeft and ArrowRight swapped in right-to-left text; Home and End move to the first and last.
 * The item a move focuses is checked if it is still mounted, enabled and focused after its focus
 * handlers ran; other focus never checks. One enabled item is the tab stop (`tabindex="0"`): the
 * focused one, else the first checked, else the first. In a Toolbar Radio Group the item belongs
 * to the Toolbar's roving focus instead: it shares the Toolbar's tab stop and arrow order along
 * its orientation, is never preferred, and moves never check.
 * Root or own disabled state sets native `disabled`, `aria-disabled` and `data-disabled` and
 * removes the item from navigation; a disabled checked item stays `aria-checked="true"`. If a
 * focused item is removed or disabled while focus has not moved elsewhere, focus moves to the new
 * tab stop without checking. Requires a nearest Radio Group root; values should be distinct within it.
 */
@Directive({
  selector: "button[ogRadioGroupItem]",
  providers: [OrigamiRadioGroupItemOptions.provideExisting(() => OrigamiRadioGroupItem)],
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
   * Own value input, default a generated value that hydration doesn't keep; give each item an
   * explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueValue("radio-group-item"));
  /** Own disabled input, default false with boolean-attribute coercion; combined with the root's disabled policy. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiRadioGroupItemOptions);
  readonly #context = inject(RadioGroupContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  /** @internal Combined root and own disabled policy. */
  protected readonly effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );
  /** @internal Checked ARIA observation, always `true` or `false`. */
  protected readonly checked = computed(() => this.#context.value() === this.#options().value());

  readonly #focus = inject(ɵOrigamiRovingFocusContext);

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop() === this.#element) {
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
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this item for roving focus once Angular has set its inputs. */
  ngOnInit(): void {
    this.#focus.register(
      {
        element: this.#element,
        value: computed(() => this.#options().value()),
        disabled: this.effectiveDisabled,
      },
      this.#destroyRef,
    );
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

  /** @internal Arrow/Home/End navigation: all four arrows, or the Toolbar's axis in a Toolbar Radio Group. */
  protected keydown(event: KeyboardEvent): void {
    this.#focus.keydown(this.#element, event);
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected focused(): void {
    this.#focus.focus(this.#element);
  }

  /** @internal Focus tracking for the roving tab stop. */
  protected blurred(): void {
    this.#focus.blur(this.#element);
  }

  /** Live activation guard: mounted and not disabled by the root or its own Options. */
  #selectable(): boolean {
    return !this.#destroyed && !this.effectiveDisabled();
  }
}

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
import { injectDeferred } from "@loozo/origami-ui/utils";
import { ToolbarContext } from "./toolbar";

/**
 * Effective item configuration. Other items read it only once the item has registered with the
 * roving focus in `ngOnInit`, after Angular set its inputs, so replacement Options may use
 * required inputs.
 */
export abstract class OrigamiToolbarItemOptions {
  /** Sets native `disabled` and removes the item from navigation. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiToolbarItemOptions> | AbstractType<OrigamiToolbarItemOptions>,
  ): Provider {
    return { provide: OrigamiToolbarItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply disabled.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiToolbarItemOptions): Provider {
    return { provide: OrigamiToolbarItemOptions, useFactory: factory };
  }
}

/**
 * A native `type="button"` control in the nearest Toolbar. It keeps its own activation: Toolbar never clicks, and a click focuses the item if it is still
 * mounted and enabled, so it becomes the roving position in every engine. Arrow keys along the
 * Toolbar's orientation (horizontal arrows follow reading direction), Home and End move focus among
 * enabled items and Toolbar group items in DOM order, wrapping at the ends, and never activate.
 * One enabled control is the tab stop (`tabindex="0"`): the focused one, else the first. Own
 * disabled state sets native `disabled`, `aria-disabled` and `data-disabled` and removes the item
 * from navigation. If a focused item is removed or disabled while focus has not moved elsewhere,
 * focus moves to the new tab stop without activating. Requires a nearest Toolbar; do not also
 * apply it to a ToggleGroup or RadioGroup item, which registers on its own.
 */
@Directive({
  selector: "button[ogToolbarItem]",
  providers: [OrigamiToolbarItemOptions.provideExisting(() => OrigamiToolbarItem)],
  host: {
    type: "button",
    "[disabled]": "effectiveDisabled()",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-disabled]": "disabledAria()",
    "[attr.data-disabled]": "disabledAttribute()",
    "(click)": "clicked()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiToolbarItem implements OrigamiToolbarItemOptions {
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly #options = injectDeferred(OrigamiToolbarItemOptions);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;

  /** @internal Native disabled host binding. */
  protected readonly effectiveDisabled = computed(() => this.#options().disabled());

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

  /** @internal Disabled host marker. */
  protected readonly disabledAttribute = computed(() => {
    if (this.effectiveDisabled()) {
      return "";
    }

    return null;
  });

  /** Resolves the nearest Toolbar synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    inject(ToolbarContext);
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this item for roving focus once Angular has set its inputs. */
  ngOnInit(): void {
    // An item has no value of its own; the Toolbar prefers no value, so it never matters.
    this.#focus.register(
      { element: this.#element, value: computed(() => ""), disabled: this.effectiveDisabled },
      this.#destroyRef,
    );
  }

  /**
   * @internal Not every engine focuses a clicked button, so a click focuses this item to make it
   * the roving position. The consumer's own click listeners may have removed or disabled it, so
   * the guard reads live state.
   */
  protected clicked(): void {
    if (this.#destroyed || this.effectiveDisabled()) {
      return;
    }

    this.#element.focus();
  }

  /** @internal Arrow/Home/End navigation along the Toolbar's orientation. */
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
}

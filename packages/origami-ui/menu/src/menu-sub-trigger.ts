import {
  DestroyRef,
  Directive,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiButtonOptions } from "@loozo/origami-ui/button";
import {
  OrigamiPopoverAnchor,
  OrigamiPopoverAnchorOptions,
  OrigamiPopoverTrigger,
  OrigamiPopoverTriggerOptions,
} from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { OrigamiMenuState } from "./menu";
import { rtl } from "./menu-content-context";
import { MenuContext } from "./menu-context";
import { MenuItemContext } from "./menu-item-context";

/**
 * Substitutable sub-trigger identity, disabled policy and typeahead text. Other parts read it only
 * once the sub-trigger has registered in `ngOnInit`, after Angular set its inputs.
 */
export abstract class OrigamiMenuSubTriggerOptions {
  /** Effective reactive DOM ID, which also names the submenu (its Content's `aria-labelledby`). */
  abstract readonly id: Signal<string>;
  /**
   * Blocks opening the submenu, combined with the Sub's disabled; default false. The sub-trigger
   * stays focusable and is still reached by arrows and typeahead: `aria-disabled="true"` and
   * `data-disabled`, never native `disabled`. Becoming true closes an open submenu.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Typeahead text in the enclosing menu; default null, where typeahead reads the sub-trigger's
   * text, whitespace collapsed, when a key is pressed.
   */
  abstract readonly label: Signal<string | null>;

  /**
   * Replaces sub-trigger Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuSubTriggerOptions> | AbstractType<OrigamiMenuSubTriggerOptions>,
  ): Provider {
    return { provide: OrigamiMenuSubTriggerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all sub-trigger Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `id`, `disabled` and `label`.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiMenuSubTriggerOptions): Provider {
    return { provide: OrigamiMenuSubTriggerOptions, useFactory: factory };
  }
}

/**
 * The item that opens an `ogMenuSub`: an item of the enclosing menu's Content, a native
 * `type="button"` with `role="menuitem"`, `aria-haspopup="menu"` and `tabindex="-1"`, and the
 * submenu's trigger. It composes the Popover Trigger and Anchor of its Sub, so the submenu is placed
 * against it, `aria-expanded` reports whether the submenu participates and `aria-controls` names
 * its mounted Content.
 *
 * ArrowRight, ArrowLeft in right to left (its computed `direction` when the key is pressed), Enter
 * and Space open the submenu and focus its first item. It handles those keys itself and prevents
 * their default, so the button's own click doesn't run for them. ArrowDown, ArrowUp, Home, End and
 * typeahead treat it as any item of the enclosing menu: while that menu's search runs, Space joins
 * it instead of opening the submenu. A click opens the submenu and leaves focus
 * on the sub-trigger; a click on it while the submenu is open keeps it open. The mouse resting on
 * it for 100 ms opens the submenu without moving focus into it; leaving it starts the wait over. It has no `(select)`: opening the
 * submenu isn't an activation.
 *
 * While the Sub or its own Options are disabled it stays focusable, as a disabled item does:
 * `aria-disabled="true"` and `data-disabled`, no native `disabled`, and it opens nothing; its own
 * `(click)` listeners still run. `state` is its Sub's Menu State. Requires a nearest `ogMenuSub`
 * inside a Menu's Content; a second mounted sub-trigger in one Sub fails. Don't apply another
 * button primitive to the same button.
 *
 * @example
 * ```html
 * <button ogMenuSubTrigger>Move to</button>
 * ```
 */
@Directive({
  selector: "button[ogMenuSubTrigger]",
  exportAs: "ogMenuSubTrigger",
  hostDirectives: [OrigamiPopoverTrigger, OrigamiPopoverAnchor],
  providers: [
    OrigamiMenuSubTriggerOptions.provideExisting(() => OrigamiMenuSubTrigger),
    MenuItemContext,
    // The composed Popover Trigger only opens: it is blocked while the submenu is requested open,
    // so a click on the open submenu's sub-trigger never closes it.
    OrigamiPopoverTriggerOptions.provideFactory(() => {
      const options = inject(OrigamiMenuSubTriggerOptions);
      const context = inject(MenuContext);

      return {
        id: options.id,
        disabled: computed(() => options.disabled() || context.open()),
        focusableWhenDisabled: computed(() => true),
      };
    }),
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(OrigamiMenuSubTriggerOptions).id,
    })),
    // Its Button is disabled only by the Sub's and its own disabled, not by that block.
    OrigamiButtonOptions.provideFactory(() => {
      const options = inject(OrigamiMenuSubTriggerOptions);
      const context = inject(MenuContext);

      return {
        disabled: computed(() => context.disabled() || options.disabled()),
        focusableWhenDisabled: computed(() => true),
      };
    }),
  ],
  host: {
    role: "menuitem",
    tabindex: "-1",
    "aria-haspopup": "menu",
    "(keydown)": "keydown($event)",
    "(keyup)": "keyup($event)",
    "(focus)": "focused($event)",
    "(blur)": "blurred()",
    "(pointermove)": "hovered($event)",
    "(pointerout)": "departed($event)",
  },
})
export class OrigamiMenuSubTrigger implements OrigamiMenuSubTriggerOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("menu-sub-trigger"));
  /** Own disabled input, default false with boolean-attribute coercion; replaced Options supply effective policy instead. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own label input, default null: typeahead then reads the sub-trigger's text. */
  readonly label = input<string | null>(null);
  /** Its Sub's readonly Menu State. */
  readonly state = inject(OrigamiMenuState);

  readonly #options = injectDeferred(OrigamiMenuSubTriggerOptions);
  readonly #context = inject(MenuContext);
  readonly #item = inject(MenuItemContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #destroyed = false;
  /** The Space press this sub-trigger handled and is still held on it: its keyup must not click. */
  #space = false;

  /** Sub or own disabled policy, the opening guard. */
  readonly #effectiveDisabled = computed(
    () => this.#context.disabled() || this.#options().disabled(),
  );

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });

    // Disabling this sub-trigger closes an open submenu; the Sub closes it for its own disabled.
    let wasDisabled: boolean | null = null;

    effect(() => {
      const disabled = this.#options().disabled();

      if (wasDisabled === false && disabled) {
        untracked(() => this.#context.close());
      }

      wasDisabled = disabled;
    });

    // A close ends the handled press's guard too.
    effect(() => {
      if (!this.#context.open()) {
        this.#space = false;
      }
    });
  }

  /** @internal Registers with its Sub as its trigger and with the enclosing menu as an item. */
  ngOnInit(): void {
    this.#context.registerTrigger(
      { element: this.#element, id: computed(() => this.#options().id()) },
      this.#destroyRef,
    );
    this.#item.register(
      {
        disabled: this.#effectiveDisabled,
        label: computed(() => this.#options().label()),
        sub: this.#context,
      },
      this.#destroyRef,
    );
  }

  /** @internal The opening keys. Handled keys prevent their default, which keeps Enter and Space from clicking the button. */
  protected keydown(event: KeyboardEvent): void {
    // Every Space press decides for itself.
    if (event.key === " ") {
      this.#space = false;
    }

    if (
      this.#destroyed ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      this.#effectiveDisabled()
    ) {
      return;
    }

    const key = event.key;

    // A presented submenu is a Popover layer, which takes Escape; one opened in this frame isn't
    // yet, so the sub-trigger closes it and consumes the key, which the enclosing menu then keeps.
    if (key === "Escape") {
      if (this.#context.open() && !this.#context.participating()) {
        event.preventDefault();
        this.#context.close();
      }

      return;
    }

    let forward = "ArrowRight";

    if (rtl(this.#element)) {
      forward = "ArrowLeft";
    }

    // Space joins its menu's running search instead, which Content handles.
    if (
      (key !== forward && key !== "Enter" && key !== " ") ||
      (key === " " && this.#item.searching(event.timeStamp))
    ) {
      return;
    }

    event.preventDefault();
    this.#context.keyed();
    this.#context.enter("first");

    if (key === " ") {
      this.#space = true;
    }
  }

  /** @internal A handled Space would click the button on keyup in some engines. */
  protected keyup(event: KeyboardEvent): void {
    if (event.key === " " && this.#space) {
      this.#space = false;
      event.preventDefault();
    }
  }

  /** @internal */
  protected focused(event: FocusEvent): void {
    this.#item.focused(event.relatedTarget);
  }

  /** @internal A handled Space released after focus left, such as on the item it focused, ends there. */
  protected blurred(): void {
    this.#space = false;
    this.#item.blurred();
  }

  /** @internal */
  protected hovered(event: PointerEvent): void {
    this.#item.hovered(event);
  }

  /** @internal */
  protected departed(event: PointerEvent): void {
    this.#item.departed(event);
  }
}

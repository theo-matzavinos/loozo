import {
  DestroyRef,
  Directive,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { Observable } from "rxjs";
import { MenuItemContext } from "./menu-item-context";
import { MenuRadioGroupContext } from "./menu-radio-group";

/**
 * Effective radio item configuration. Other parts read it only once the item has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 */
export abstract class OrigamiMenuRadioItemOptions {
  /** The value its group's `value` takes when the item is selected; it is checked while they're equal. */
  abstract readonly value: Signal<string>;
  /**
   * Keeps the item from being selected; default false. A disabled item stays focusable and is
   * still reached by arrows and typeahead: `aria-disabled="true"` and `data-disabled`, never
   * native `disabled`.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Typeahead text; default null, where typeahead reads the item's text, whitespace collapsed,
   * when a key is pressed.
   */
  abstract readonly label: Signal<string | null>;

  /**
   * Replaces radio item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuRadioItemOptions> | AbstractType<OrigamiMenuRadioItemOptions>,
  ): Provider {
    return { provide: OrigamiMenuRadioItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all radio item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `value`, `disabled` and
   *   `label`.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiMenuRadioItemOptions): Provider {
    return { provide: OrigamiMenuRadioItemOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade of one radio item; descendants of the item inject it. */
@Service({ autoProvided: false })
export class OrigamiMenuRadioItemState {
  readonly #options = injectDeferred(OrigamiMenuRadioItemOptions);
  readonly #group = inject(MenuRadioGroupContext);
  readonly #context = inject(MenuItemContext);

  /** Whether its group's effective `value` is the item's effective `value`, for its indicator. */
  readonly checked: Signal<boolean> = computed(
    () => this.#group.value() === this.#options().value(),
  );
  /** The item's own effective disabled state. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /**
   * Emits synchronously when the item is selected, after its group's `value` was written, also
   * when it was already checked; for Enter, the menu had focused its Trigger and closed before that
   * write. Never while the item is disabled.
   */
  readonly select: Observable<void> = this.#context.selects;
}

/**
 * One choice of an `ogMenuRadioGroup` in a Menu's Content: a native `type="button"` with
 * `role="menuitemradio"`, `aria-checked` and `tabindex="-1"`, composing `ogButton`. It is checked
 * while its group's `value` is its `value`. A click or Space writes its value to the group and
 * emits `(select)`, leaving the menu open with focus on the item; Enter writes it and closes the
 * menu: the menu focuses its Trigger, closes, writes the group's `value`, then the item emits
 * `(select)`, the same order as `ogMenuItem`'s. Selecting the checked item writes nothing, so a
 * group never clears, and still emits `(select)`; Enter still closes. The menu handles that Enter on
 * its keydown, so the button gets no click for it; any click, a script's too, leaves the menu open.
 *
 * A disabled item stays focusable, as the APG menu pattern asks: `aria-disabled="true"` and
 * `data-disabled`, no native `disabled`, still reached by arrows and typeahead. It never writes,
 * never emits `(select)` and doesn't close the menu, but its own `(click)` listeners still run, as
 * on any focusable disabled `ogButton`. Arrows, typeahead and hover only move focus.
 *
 * `label` is its typeahead text; without it, typeahead reads its text. Requires a nearest
 * `ogMenuRadioGroup` and a nearest Menu Content. Don't apply another button primitive to the same
 * button.
 *
 * @example
 * ```html
 * <button ogMenuRadioItem #compact="ogMenuRadioItem" value="compact">
 *   <span aria-hidden="true">{{ compact.state.checked() ? "●" : "" }}</span> Compact
 * </button>
 * ```
 */
@Directive({
  selector: "button[ogMenuRadioItem]",
  exportAs: "ogMenuRadioItem",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiMenuRadioItemOptions.provideExisting(() => OrigamiMenuRadioItem),
    MenuItemContext,
    OrigamiMenuRadioItemState,
    OrigamiButtonOptions.provideFactory(() => ({
      disabled: inject(OrigamiMenuRadioItemOptions).disabled,
      focusableWhenDisabled: computed(() => true),
    })),
  ],
  host: {
    role: "menuitemradio",
    tabindex: "-1",
    "[attr.aria-checked]": "ariaChecked()",
    "[attr.data-checked]": "dataChecked()",
    "(click)": "clicked()",
    "(focus)": "focused()",
    "(blur)": "blurred()",
    "(pointermove)": "hovered($event)",
    "(pointerout)": "departed($event)",
  },
})
export class OrigamiMenuRadioItem implements OrigamiMenuRadioItemOptions {
  /** Own required value input. */
  readonly value = input.required<string>();
  /** Own disabled input, default false with boolean-attribute coercion. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own label input, default null: typeahead then reads the item's text. */
  readonly label = input<string | null>(null);
  /** This item's readonly State. */
  readonly state = inject(OrigamiMenuRadioItemState);

  readonly #options = injectDeferred(OrigamiMenuRadioItemOptions);
  readonly #group = inject(MenuRadioGroupContext);
  readonly #context = inject(MenuItemContext);
  readonly #destroyRef = inject(DestroyRef);

  /**
   * Emits when the item is selected by a click, Enter or Space, after its group's `value` was
   * written, also when it was already checked; for Enter, the menu had focused its Trigger and
   * closed first. Never while it is disabled.
   */
  readonly select = outputFromObservable(this.#context.selects);

  /** @internal */
  protected readonly ariaChecked = computed(() => String(this.state.checked()));
  /** @internal */
  protected readonly dataChecked = computed(() => {
    if (this.state.checked()) {
      return "";
    }

    return null;
  });

  /** @internal Registers with its menu once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.register(
      {
        disabled: computed(() => this.#options().disabled()),
        label: computed(() => this.#options().label()),
      },
      this.#destroyRef,
      () => this.#choose(),
    );
  }

  /** @internal A click, Space's too, selects an enabled item and leaves the menu open. */
  protected clicked(): void {
    if (!this.#options().disabled()) {
      this.#context.check(() => this.#choose(), false);
    }
  }

  /** @internal */
  protected focused(): void {
    this.#context.focused();
  }

  /** @internal */
  protected blurred(): void {
    this.#context.blurred();
  }

  /** @internal */
  protected hovered(event: PointerEvent): void {
    this.#context.hovered(event);
  }

  /** @internal */
  protected departed(event: PointerEvent): void {
    this.#context.departed(event);
  }

  /** Writes the item's value to its group. */
  #choose(): void {
    this.#group.choose(this.#options().value());
  }
}

import {
  DestroyRef,
  Directive,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred } from "@loozo/origami-ui/utils";
import type { Observable } from "rxjs";
import { MenuItemContext } from "./menu-item-context";

/**
 * Effective checkbox item configuration. Other parts read it only once the item has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 */
export abstract class OrigamiMenuCheckboxItemOptions {
  /**
   * Writable checked state; the direct model defaults to false. A click, Enter or Space on the
   * enabled item flips it; external writes remain authoritative, also while disabled.
   */
  abstract readonly checked: WritableSignal<boolean>;
  /**
   * Keeps the item from toggling; default false. A disabled item stays focusable and is still
   * reached by arrows and typeahead: `aria-disabled="true"` and `data-disabled`, never native
   * `disabled`.
   */
  abstract readonly disabled: Signal<boolean>;
  /**
   * Typeahead text; default null, where typeahead reads the item's text, whitespace collapsed,
   * when a key is pressed.
   */
  abstract readonly label: Signal<string | null>;

  /**
   * Replaces checkbox item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuCheckboxItemOptions> | AbstractType<OrigamiMenuCheckboxItemOptions>,
  ): Provider {
    return { provide: OrigamiMenuCheckboxItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all checkbox item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `checked`, `disabled` and
   *   `label`.
   * @returns A local provider; unused directive defaults are not merged into the result. Ordinary
   *   writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiMenuCheckboxItemOptions): Provider {
    return { provide: OrigamiMenuCheckboxItemOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade of one checkbox item; descendants of the item inject it. */
@Service({ autoProvided: false })
export class OrigamiMenuCheckboxItemState {
  readonly #options = injectDeferred(OrigamiMenuCheckboxItemOptions);
  readonly #context = inject(MenuItemContext);

  /** The item's effective checked state, for its indicator. */
  readonly checked: Signal<boolean> = computed(() => this.#options().checked());
  /** The item's own effective disabled state. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /**
   * Emits synchronously when the item is toggled, after `checked` was written; for Enter, the menu
   * had focused its Trigger and closed before that write. Never while the item is disabled.
   */
  readonly select: Observable<void> = this.#context.selects;
}

/**
 * An option the user turns on and off in a Menu's Content, such as a column to show: a native
 * `type="button"` with `role="menuitemcheckbox"`, `aria-checked` and `tabindex="-1"`, composing
 * `ogButton`. A click or Space flips `checked` and emits `(select)`, leaving the menu open with
 * focus on the item, so several can be changed in a row. Enter flips it and closes the menu: the
 * menu focuses its Trigger, closes, writes `checked`, then the item emits `(select)`, the same
 * order as `ogMenuItem`'s. The menu handles that Enter on its keydown, so the button gets no click
 * for it; any click, a script's too, leaves the menu open.
 *
 * A disabled item stays focusable, as the APG menu pattern asks: `aria-disabled="true"` and
 * `data-disabled`, no native `disabled`, still reached by arrows and typeahead. It never writes
 * `checked`, never emits `(select)` and doesn't close the menu, but its own `(click)` listeners
 * still run, as on any focusable disabled `ogButton`. Arrows, typeahead and hover only move focus.
 *
 * `label` is its typeahead text; without it, typeahead reads its text. Requires a nearest Menu
 * Content. Don't apply another button primitive to the same button.
 *
 * @example
 * ```html
 * <button ogMenuCheckboxItem #owner="ogMenuCheckboxItem" [(checked)]="showOwner">
 *   <span aria-hidden="true">{{ owner.state.checked() ? "✓" : "" }}</span> Owner
 * </button>
 * ```
 */
@Directive({
  selector: "button[ogMenuCheckboxItem]",
  exportAs: "ogMenuCheckboxItem",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiMenuCheckboxItemOptions.provideExisting(() => OrigamiMenuCheckboxItem),
    MenuItemContext,
    OrigamiMenuCheckboxItemState,
    OrigamiButtonOptions.provideFactory(() => ({
      disabled: inject(OrigamiMenuCheckboxItemOptions).disabled,
      focusableWhenDisabled: computed(() => true),
    })),
  ],
  host: {
    role: "menuitemcheckbox",
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
export class OrigamiMenuCheckboxItem implements OrigamiMenuCheckboxItemOptions {
  /**
   * Own checked model, default false; `checkedChange` emits the item's toggles. Replaced Options
   * supply the effective state instead.
   */
  readonly checked = model(false);
  /** Own disabled input, default false with boolean-attribute coercion. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own label input, default null: typeahead then reads the item's text. */
  readonly label = input<string | null>(null);
  /** This item's readonly State. */
  readonly state = inject(OrigamiMenuCheckboxItemState);

  readonly #options = injectDeferred(OrigamiMenuCheckboxItemOptions);
  readonly #context = inject(MenuItemContext);
  readonly #destroyRef = inject(DestroyRef);

  /**
   * Emits when the item is toggled by a click, Enter or Space, after `checked` was written; for
   * Enter, the menu had focused its Trigger and closed first. Never while it is disabled.
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
      () => this.#toggle(),
    );
  }

  /** @internal A click, Space's too, toggles an enabled item and leaves the menu open. */
  protected clicked(): void {
    if (!this.#options().disabled()) {
      this.#context.check(() => this.#toggle(), false);
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

  /** Flips the effective `checked`. */
  #toggle(): void {
    const checked = this.#options().checked;

    checked.set(!checked());
  }
}

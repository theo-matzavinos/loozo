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

/**
 * Effective item configuration. Other parts read it only once the item has registered in
 * `ngOnInit`, after Angular set its inputs, so replacement Options may use required inputs.
 */
export abstract class OrigamiMenuItemOptions {
  /**
   * Keeps the item from activating; default false. A disabled item stays focusable and is still
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
   * Replaces item Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuItemOptions> | AbstractType<OrigamiMenuItemOptions>,
  ): Provider {
    return { provide: OrigamiMenuItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all item Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `disabled` and `label`.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiMenuItemOptions): Provider {
    return { provide: OrigamiMenuItemOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade of one item; descendants of the item inject it. */
@Service({ autoProvided: false })
export class OrigamiMenuItemState {
  readonly #options = injectDeferred(OrigamiMenuItemOptions);
  readonly #context = inject(MenuItemContext);

  /** The item's own effective disabled state. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /**
   * Emits synchronously when the item is activated, after the menu has focused its Trigger and
   * closed; never while the item is disabled.
   */
  readonly select: Observable<void> = this.#context.selects;
}

/**
 * An action in a Menu's Content: a native `type="button"` with `role="menuitem"` and
 * `tabindex="-1"`, composing `ogButton`. A click, Enter or Space activates it: the menu focuses
 * its Trigger, closes, and then the item emits `(select)`. So a Dialog that the listener opens
 * records the Trigger as the element to return focus to, and focus the listener moves wins.
 *
 * A disabled item stays focusable, as the APG menu pattern asks: `aria-disabled="true"` and
 * `data-disabled`, no native `disabled`, still reached by arrows and typeahead. It never emits
 * `(select)` and doesn't close the menu, but its own `(click)` listeners still run, as on any
 * focusable disabled `ogButton`: listen to `(select)`, not `(click)`.
 *
 * `label` is its typeahead text; without it, typeahead reads its text. Items register once
 * Angular has set their inputs and may come and go, also in `@for`, `@if` and `@defer`; an item
 * that isn't mounted can't be reached. Requires a nearest Menu Content. Don't apply another
 * button primitive to the same button.
 *
 * @example
 * ```html
 * <button ogMenuItem (select)="archive()">Archive</button>
 * <button ogMenuItem disabled>Unavailable</button>
 * ```
 */
@Directive({
  selector: "button[ogMenuItem]",
  exportAs: "ogMenuItem",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiMenuItemOptions.provideExisting(() => OrigamiMenuItem),
    MenuItemContext,
    OrigamiMenuItemState,
    OrigamiButtonOptions.provideFactory(() => ({
      disabled: inject(OrigamiMenuItemOptions).disabled,
      focusableWhenDisabled: computed(() => true),
    })),
  ],
  host: {
    role: "menuitem",
    tabindex: "-1",
    "(click)": "clicked()",
    "(focus)": "focused()",
    "(blur)": "blurred()",
    "(pointermove)": "hovered($event)",
  },
})
export class OrigamiMenuItem implements OrigamiMenuItemOptions {
  /** Own disabled input, default false with boolean-attribute coercion. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own label input, default null: typeahead then reads the item's text. */
  readonly label = input<string | null>(null);
  /** This item's readonly State. */
  readonly state = inject(OrigamiMenuItemState);

  readonly #options = injectDeferred(OrigamiMenuItemOptions);
  readonly #context = inject(MenuItemContext);
  readonly #destroyRef = inject(DestroyRef);

  /**
   * Emits when the item is activated by a click, Enter or Space, after the menu has focused its
   * Trigger and closed; never while it is disabled.
   */
  readonly select = outputFromObservable(this.#context.selects);

  /** @internal Registers with its menu once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.register(
      {
        disabled: computed(() => this.#options().disabled()),
        label: computed(() => this.#options().label()),
      },
      this.#destroyRef,
    );
  }

  /** @internal A click, Enter or Space activates an enabled item. */
  protected clicked(): void {
    if (!this.#options().disabled()) {
      this.#context.activate();
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
}

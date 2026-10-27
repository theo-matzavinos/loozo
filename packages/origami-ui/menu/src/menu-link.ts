import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { MenuItemContext } from "./menu-item-context";

/** Effective link configuration, read only once the link has registered in `ngOnInit`. */
export abstract class OrigamiMenuLinkOptions {
  /**
   * Typeahead text; default null, where typeahead reads the link's text, whitespace collapsed,
   * when a key is pressed.
   */
  abstract readonly label: Signal<string | null>;

  /**
   * Replaces link Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMenuLinkOptions> | AbstractType<OrigamiMenuLinkOptions>,
  ): Provider {
    return { provide: OrigamiMenuLinkOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all link Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `label`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiMenuLinkOptions): Provider {
    return { provide: OrigamiMenuLinkOptions, useFactory: factory };
  }
}

const notDisabled = computed(() => false);

/**
 * A navigation item in a Menu's Content: `role="menuitem"` and `tabindex="-1"` on your own
 * anchor, whose `href`, `routerLink`, `target` and `download` stay native. A primary click,
 * Enter or Space follows the link as usual, and the menu focuses its Trigger, closes and emits
 * `(select)`, in that order. A click with Ctrl, Cmd, Shift or Alt, or with the middle button,
 * leaves the menu open and lets the browser act, such as opening a new tab. The link never
 * prevents a click's default, so `routerLink` always runs.
 *
 * There is no `disabled`: an anchor can't stop `routerLink` from navigating. Render an
 * unavailable destination as a disabled `ogMenuItem` instead. `label` is its typeahead text;
 * without it, typeahead reads its text. Requires a nearest Menu Content.
 *
 * @example
 * ```html
 * <a ogMenuLink [routerLink]="['/todos', todo.id, 'edit']">Edit</a>
 * ```
 */
@Directive({
  selector: "a[ogMenuLink]",
  exportAs: "ogMenuLink",
  providers: [OrigamiMenuLinkOptions.provideExisting(() => OrigamiMenuLink), MenuItemContext],
  host: {
    role: "menuitem",
    tabindex: "-1",
    "(click)": "clicked($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
    "(pointermove)": "hovered($event)",
  },
})
export class OrigamiMenuLink implements OrigamiMenuLinkOptions {
  /** Own label input, default null: typeahead then reads the link's text. */
  readonly label = input<string | null>(null);

  readonly #options = injectDeferred(OrigamiMenuLinkOptions);
  readonly #context = inject(MenuItemContext);
  readonly #destroyRef = inject(DestroyRef);

  /**
   * Emits when a primary, unmodified click, Enter or Space follows the link, after the menu has
   * focused its Trigger and closed; never for a modified or middle click.
   */
  readonly select = outputFromObservable(this.#context.selects);

  /** @internal Registers with its menu once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.register(
      { disabled: notDisabled, label: computed(() => this.#options().label()) },
      this.#destroyRef,
    );
  }

  /** @internal A primary, unmodified click follows the link and closes the menu; others leave it open. */
  protected clicked(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    this.#context.activate();
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

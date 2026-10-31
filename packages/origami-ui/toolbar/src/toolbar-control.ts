import { DestroyRef, Directive, ElementRef, computed, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { ɵOrigamiRovingFocusContext } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { ToolbarContext, contentFocusValue } from "./toolbar";

/**
 * A control variant's own Content, provided on the control's element by the variant that has
 * one (`ogToolbarPopoverTrigger`). While focus is inside it the control keeps the Toolbar's tab
 * stop. Internal to `/toolbar`, not exported.
 */
export abstract class ToolbarControlContent {
  /** Focus is inside the control's own Content. */
  abstract readonly hasFocus: Signal<boolean>;
}

/**
 * @internal Package-private Toolbar control behavior, composed by `ogToolbarItem`,
 * `ogToolbarToggle` and `ogToolbarPopoverTrigger` beside the button primitive each composes. It
 * registers its button with the nearest Toolbar's roving focus in `ngOnInit`, with the disabled
 * state and disabled focusability of the `OrigamiButtonOptions` on its own element, and binds
 * the roving `tabindex`, arrow keys and click focus. It never activates its button. Requires a
 * nearest Toolbar. Not an application API.
 */
@Directive({
  host: {
    "[attr.tabindex]": "tabIndex()",
    "(click)": "clicked()",
    "(keydown)": "keydown($event)",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class ɵOrigamiToolbarControl {
  readonly #button = injectDeferred(OrigamiButtonOptions);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #focus = inject(ɵOrigamiRovingFocusContext);
  readonly #content = inject(ToolbarControlContent, { optional: true, self: true });
  #destroyed = false;

  readonly #disabled = computed(() => this.#button().disabled());
  readonly #focusable = computed(() => this.#button().focusableWhenDisabled());

  /** @internal Roving tab stop. */
  protected readonly tabIndex = computed(() => {
    if (this.#focus.tabStop() === this.#element) {
      return "0";
    }

    return "-1";
  });

  /** Resolves the nearest Toolbar synchronously; an orphan fails Angular DI clearly. */
  constructor() {
    inject(ToolbarContext);
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /** @internal Registers this control for roving focus once Angular has set its inputs. */
  ngOnInit(): void {
    const content = this.#content;

    // A control has no value of its own. It registers the Toolbar's preferred value only while
    // focus is inside its own Content, so it is the tab stop while no control has focus.
    this.#focus.register(
      {
        element: this.#element,
        value: computed(() => {
          if (content !== null && content.hasFocus()) {
            return contentFocusValue;
          }

          return "";
        }),
        disabled: this.#disabled,
        focusable: this.#focusable,
      },
      this.#destroyRef,
    );
  }

  /**
   * @internal Not every engine focuses a clicked button, so a click focuses this control to make
   * it the roving position, also while it is disabled but focusable. Listeners that ran before it,
   * such as the composed Toggle's and its output listeners, may have removed or disabled it, so
   * the guard reads live state.
   */
  protected clicked(): void {
    if (this.#destroyed || (this.#disabled() && !this.#focusable())) {
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

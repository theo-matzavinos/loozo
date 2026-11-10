import { Directive, computed, inject } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { NumberFieldContext } from "./number-field-context";

/**
 * The composed `ogButton`'s whole Options for a Decrement (−1) or Increment (+1) button: natively
 * disabled while the root is; disabled but focusable while the root is readonly or the step can't
 * move (at its bound, or a step that isn't positive).
 */
function provideStepButton(direction: -1 | 1) {
  return OrigamiButtonOptions.provideFactory(() => {
    const context = inject(NumberFieldContext);

    return {
      disabled: computed(() => !context.canStep(direction)),
      focusableWhenDisabled: computed(() => !context.disabled()),
    };
  });
}

/**
 * Steps the value up by the root's `step`, as ArrowUp in the Input does; composes `ogButton`, so it
 * is a native `type="button"`. It stays out of the tab order (`tabindex="-1"`): keyboard users
 * step with the arrows. `aria-controls` names the Input while one is mounted. Pressing it with
 * the mouse keeps focus and the selection in the Input, or moves focus there; a touch or pen press
 * is native, and its click steps all the same. Natively disabled while the root is
 * disabled; `aria-disabled="true"` and `data-disabled`, still focusable, while the root is readonly
 * or the value can't go up (at `max`, or a step that isn't positive). The consumer supplies its
 * accessible name, such as `aria-label="Increase"`, and its content. Requires a nearest number
 * field root.
 */
@Directive({
  selector: "button[ogNumberFieldIncrement]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton(1)],
  host: {
    tabindex: "-1",
    "[attr.aria-controls]": "controls()",
    "(pointerdown)": "pointerDown($event)",
    "(mousedown)": "pressed($event)",
    "(click)": "clicked()",
  },
})
export class OrigamiNumberFieldIncrement {
  readonly #context = inject(NumberFieldContext);

  /** @internal The registered Input's ID, absent while none is mounted. */
  protected readonly controls = computed(() => this.#context.input()?.id ?? null);

  /** The `pointerType` of the press whose `mousedown` comes next. */
  #pointerType: string | null = null;

  /** @internal Records the press's pointer: a touch or pen press's `mousedown` is native. */
  protected pointerDown(event: PointerEvent): void {
    this.#pointerType = event.pointerType;
  }

  /** @internal A primary-button mouse press keeps focus and the selection in the Input. */
  protected pressed(event: MouseEvent): void {
    const pointerType = this.#pointerType;

    this.#pointerType = null;
    this.#context.press(event, pointerType);
  }

  /** @internal A disabled button's click does nothing. */
  protected clicked(): void {
    this.#context.step(1);
  }
}

/**
 * Steps the value down by the root's `step`, as ArrowDown in the Input does; the counterpart of
 * `ogNumberFieldIncrement`, with the same semantics: `type="button"`, `tabindex="-1"`,
 * `aria-controls`, a mouse press keeping focus in the Input, natively disabled while the root is, and
 * focusable but disabled while it is readonly or the value can't go down (at `min`). The consumer
 * supplies its accessible name, such as `aria-label="Decrease"`. Requires a nearest number field
 * root.
 */
@Directive({
  selector: "button[ogNumberFieldDecrement]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton(-1)],
  host: {
    tabindex: "-1",
    "[attr.aria-controls]": "controls()",
    "(pointerdown)": "pointerDown($event)",
    "(mousedown)": "pressed($event)",
    "(click)": "clicked()",
  },
})
export class OrigamiNumberFieldDecrement {
  readonly #context = inject(NumberFieldContext);

  /** @internal The registered Input's ID, absent while none is mounted. */
  protected readonly controls = computed(() => this.#context.input()?.id ?? null);

  /** The `pointerType` of the press whose `mousedown` comes next. */
  #pointerType: string | null = null;

  /** @internal Records the press's pointer: a touch or pen press's `mousedown` is native. */
  protected pointerDown(event: PointerEvent): void {
    this.#pointerType = event.pointerType;
  }

  /** @internal A primary-button mouse press keeps focus and the selection in the Input. */
  protected pressed(event: MouseEvent): void {
    const pointerType = this.#pointerType;

    this.#pointerType = null;
    this.#context.press(event, pointerType);
  }

  /** @internal A disabled button's click does nothing. */
  protected clicked(): void {
    this.#context.step(-1);
  }
}

import { DestroyRef, Directive, ElementRef, computed, inject } from "@angular/core";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { SliderContext } from "./slider-context";

/**
 * The Slider's focusable handle: static `role="slider"` with `aria-valuenow` (the value clamped
 * to the range), `aria-valuemin` and `aria-valuemax` (the effective bounds), the tab stop
 * `tabindex="0"` while enabled and, while disabled, no `tabindex` and `aria-disabled="true"`. It
 * binds no `aria-orientation`: horizontal is the default. The consumer names it and supplies
 * `aria-valuetext` when the number alone doesn't read well, such as `"40%"`.
 *
 * Keys, with Alt, Ctrl, Meta and Shift ignored, as are keys already `defaultPrevented`, keys
 * during IME composition and every key while disabled: ArrowRight
 * and ArrowUp move to the next allowed value above the current one, ArrowLeft and ArrowDown to the
 * one below, so an off-grid value lands on the grid; ArrowLeft and ArrowRight swap when its
 * computed `direction` is `rtl`. PageUp and PageDown move a tenth of the range, rounded to whole
 * steps and at least one; Home and End move to `min` and the last allowed value. Handled keys
 * prevent their default even when they write nothing. A key pressed before the slider hydrates is
 * applied once when it does.
 *
 * It is the control of its nearest `ogField`, governed by the `[formField]` on the Slider root,
 * and registers with the Field and the root once Angular has set its inputs. Inside a Field its
 * `aria-labelledby` names the Field's Labels, replacing a static value, and is absent while there
 * is none; a Label has no `for`, so clicking it does nothing. Its `aria-describedby` names the
 * Field's Descriptions, then its mounted Errors. `aria-invalid="true"` follows the Field's shown
 * errors and `aria-readonly="true"` the bound field; ARIA doesn't support `aria-required` on a
 * slider, so it binds none. Outside a Field, and as a second control the Field ignores, it keeps
 * those attributes' static values. Focus leaving it is the root's `touch`. Requires a nearest
 * Slider root; a second mounted Thumb fails.
 */
@Directive({
  selector: "[ogSliderThumb]",
  hostDirectives: [ɵOrigamiDescribedBy],
  host: {
    role: "slider",
    "[attr.tabindex]": "tabIndex()",
    "[attr.aria-valuenow]": "now()",
    "[attr.aria-valuemin]": "min()",
    "[attr.aria-valuemax]": "max()",
    "[attr.aria-disabled]": "ariaDisabled()",
    "[attr.aria-labelledby]": "ariaLabelledBy()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "[attr.aria-readonly]": "ariaReadonly()",
    "(keydown)": "keydown($event)",
    "(blur)": "blurred()",
  },
})
export class OrigamiSliderThumb {
  readonly #context = inject(SliderContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#element.id, {
    labelable: false,
    formState: () => this.#context.formState(),
  });

  /** @internal The value clamped to the range. */
  protected readonly now = this.#context.now;
  /** @internal The effective lowest value. */
  protected readonly min = this.#context.min;
  /** @internal The effective highest value. */
  protected readonly max = this.#context.max;
  /** @internal The tab stop while enabled. */
  protected readonly tabIndex = computed(() => {
    if (this.#context.disabled()) {
      return null;
    }

    return "0";
  });
  /** @internal Present while disabled. */
  protected readonly ariaDisabled = computed(() => {
    if (this.#context.disabled()) {
      return "true";
    }

    return null;
  });
  /** @internal The Field's Label IDs inside a Field; otherwise the static value. */
  protected readonly ariaLabelledBy = this.#membership.labelledBy;
  /** @internal The Field's shown errors inside a Field; otherwise the static value. */
  protected readonly ariaInvalid = this.#membership.invalid;
  /** @internal The bound field's `readonly()` inside a Field; otherwise the static value. */
  protected readonly ariaReadonly = this.#membership.readonly;

  /** @internal Joins the nearest Field and registers with the Slider once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
    this.#context.registerThumb({ element: this.#element }, this.#destroyRef);
  }

  /** @internal The Slider's keys. */
  protected keydown(event: KeyboardEvent): void {
    this.#context.keydown(event, this.#element);
  }

  /** @internal Focus left the Thumb: the root's `touch`. */
  protected blurred(): void {
    this.#context.left();
  }
}

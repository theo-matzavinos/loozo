import { DestroyRef, Directive, ElementRef, inject } from "@angular/core";
import { TooltipContext } from "./tooltip";

/**
 * The element the Tooltip describes: `aria-describedby` names the registered Content's effective
 * ID, open or closed, and is absent without registered Content. It replaces a static
 * `aria-describedby` instead of merging with it. The Trigger has no inputs and no Options.
 *
 * Make it focusable and give it its accessible name (`aria-label` or visually hidden text); the
 * Tooltip is its description. It binds no `type`, `role`, `disabled` or `tabindex`, so it may be
 * applied together with any button primitive, such as `ogButton` or `ogToggle`, which keeps its
 * own disabled state. A Trigger matching `:disabled` never opens the Tooltip; to explain an
 * unavailable action, use a focusable disabled button (`ogButton` with `focusableWhenDisabled`).
 *
 * Mouse or pen `pointerenter` schedules opening after the root's `openDelay`; `pointerleave`
 * cancels it. A keyboard-modality `focus` opens at once and holds the Tooltip open until `blur`.
 * `pointerdown` and `click`, including Enter and Space on a button, close it at once. Requires a
 * nearest Tooltip root; a second mounted Trigger fails clearly when it registers.
 */
@Directive({
  selector: "[ogTooltipTrigger]",
  host: {
    "[attr.aria-describedby]": "contentId()",
    "(pointerenter)": "pointerEnter($event)",
    "(pointerleave)": "pointerLeave($event)",
    "(pointerdown)": "activate()",
    "(mousedown)": "mouseDown()",
    "(click)": "clicked()",
    "(focus)": "focused()",
    "(blur)": "blurred()",
  },
})
export class OrigamiTooltipTrigger {
  readonly #context = inject(TooltipContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  /** @internal Mounted-only Content description, open or closed. */
  protected readonly contentId = this.#context.contentId;

  /** @internal Registers this Trigger once it is initialized; a second mounted Trigger fails clearly. */
  ngOnInit(): void {
    this.#context.registerTrigger({ element: this.#element }, this.#destroyRef);
  }

  /** @internal Mouse or pen hover schedules opening; touch is ignored. */
  protected pointerEnter(event: PointerEvent): void {
    this.#context.interaction.triggerEnter(event);
  }

  /** @internal Cancels a pending open; closes a Tooltip hover or focus opened, unless the pointer is crossing to Content. */
  protected pointerLeave(event: PointerEvent): void {
    this.#context.interaction.triggerLeave(this.#element, event);
  }

  /** @internal Any pointer press closes at once. */
  protected activate(): void {
    this.#context.interaction.triggerActivate();
  }

  /** @internal Any activation, including Enter and Space on a button, closes at once and ends a press's pointer focus. */
  protected clicked(): void {
    this.#context.interaction.triggerClick();
  }

  /** @internal The focus this press causes, in the same task and before its `click`, doesn't open. */
  protected mouseDown(): void {
    this.#context.interaction.triggerMouseDown();
  }

  /** @internal Keyboard-modality focus opens at once; stale or replayed focus is ignored. */
  protected focused(): void {
    this.#context.interaction.triggerFocus(this.#element);
  }

  /** @internal Closes a Tooltip hover or focus opened, unless it is still hovered or crossing. */
  protected blurred(): void {
    this.#context.interaction.triggerBlur(this.#element);
  }
}

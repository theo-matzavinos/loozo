import { Directive, computed, inject, signal } from "@angular/core";
import type { Signal } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { PaginationContext } from "./pagination-context";
import { stepTarget, writes } from "./pagination-math";
import type { PaginationStep } from "./pagination-math";

/** A step's target page around the root's effective page, or null with none. */
function injectTarget(step: PaginationStep): Signal<number | null> {
  const context = inject(PaginationContext);

  return computed(() => stepTarget(step, context.page(), context.pageCount()));
}

/**
 * The composed `ogButton`'s whole Options for a step: disabled but focusable while it has no
 * target or its target `===` the requested page, so a focused step that reaches an edge keeps
 * focus.
 */
function provideStepButton(step: PaginationStep) {
  return OrigamiButtonOptions.provideFactory(() => {
    const context = inject(PaginationContext);
    const target = injectTarget(step);

    return {
      disabled: computed(() => !writes(target(), context.requested())),
      focusableWhenDisabled: signal(true).asReadonly(),
    };
  });
}

/**
 * Goes to page 1; composes `ogButton`, so it is a native `type="button"`. Its target is 1 while
 * there are pages. Disabled but focusable (`aria-disabled="true"`, `data-disabled`, no native
 * `disabled`) while there are no pages or the requested page `===` 1; a stale request (7 of 5
 * pages) or a fractional one (1.7) keeps it enabled, so it writes back into range. A click,
 * Enter or Space reads the root at the event and writes 1 to `page`; focus stays on the button.
 * The consumer supplies its accessible name, such as `aria-label="First page"`. Requires a nearest
 * Pagination root.
 */
@Directive({
  selector: "button[ogPaginationFirst]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton("first")],
  host: { "(click)": "clicked()" },
})
export class OrigamiPaginationFirst {
  readonly #context = inject(PaginationContext);
  readonly #target = injectTarget("first");

  /** @internal A disabled step's click writes nothing. */
  protected clicked(): void {
    this.#context.write(this.#target());
  }
}

/**
 * Goes to the page before the effective one, as `ogPaginationFirst` goes to 1: disabled but
 * focusable on the first page and with no pages, and while its target `===` the requested page.
 * The consumer supplies its accessible name, such as `aria-label="Previous page"`. Requires a
 * nearest Pagination root.
 */
@Directive({
  selector: "button[ogPaginationPrevious]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton("previous")],
  host: { "(click)": "clicked()" },
})
export class OrigamiPaginationPrevious {
  readonly #context = inject(PaginationContext);
  readonly #target = injectTarget("previous");

  /** @internal A disabled step's click writes nothing. */
  protected clicked(): void {
    this.#context.write(this.#target());
  }
}

/**
 * Goes to the page after the effective one, as `ogPaginationFirst` goes to 1: disabled but
 * focusable on the last page, past it and with no pages, so Enter on Next from the second-last
 * page keeps focus on Next and a second Enter writes nothing. The consumer supplies its accessible
 * name, such as `aria-label="Next page"`. Requires a nearest Pagination root.
 */
@Directive({
  selector: "button[ogPaginationNext]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton("next")],
  host: { "(click)": "clicked()" },
})
export class OrigamiPaginationNext {
  readonly #context = inject(PaginationContext);
  readonly #target = injectTarget("next");

  /** @internal A disabled step's click writes nothing. */
  protected clicked(): void {
    this.#context.write(this.#target());
  }
}

/**
 * Goes to the last page, as `ogPaginationFirst` goes to 1: disabled but focusable with no pages
 * and while the requested page `===` the page count; a stale request past the end keeps it
 * enabled, so it writes the last page. The consumer supplies its accessible name, such as
 * `aria-label="Last page"`. Requires a nearest Pagination root.
 */
@Directive({
  selector: "button[ogPaginationLast]",
  hostDirectives: [OrigamiButton],
  providers: [provideStepButton("last")],
  host: { "(click)": "clicked()" },
})
export class OrigamiPaginationLast {
  readonly #context = inject(PaginationContext);
  readonly #target = injectTarget("last");

  /** @internal A disabled step's click writes nothing. */
  protected clicked(): void {
    this.#context.write(this.#target());
  }
}

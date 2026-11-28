import {
  Directive,
  computed,
  forwardRef,
  inject,
  input,
  numberAttribute,
  signal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { PaginationContext } from "./pagination-context";
import { pageTarget } from "./pagination-math";

/**
 * Effective configuration of a page item or page link, replaced as a whole rather than merged
 * with unused defaults. `ogPaginationItem` and `ogPaginationLink` share it.
 */
export abstract class OrigamiPaginationItemOptions {
  /**
   * The page this control stands for, from 1, required on the directives; floored. A page item
   * whose page isn't one of the pages is disabled; a page link with such a page is never marked.
   */
  abstract readonly page: Signal<number>;

  /**
   * Replaces page item or page link Options with an existing compatible concrete or abstract
   * provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiPaginationItemOptions> | AbstractType<OrigamiPaginationItemOptions>,
  ): Provider {
    return { provide: OrigamiPaginationItemOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all page item or page link Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply `page`. Its signal is first
   *   read by the part's host bindings in the first change detection, so it must hold its value by
   *   then.
   * @returns A local provider; unused directive defaults are not merged into the result.
   */
  static provideFactory(factory: () => OrigamiPaginationItemOptions): Provider {
    return { provide: OrigamiPaginationItemOptions, useFactory: factory };
  }
}

/**
 * The current mark both page controls bind: `aria-current="page"` and empty `data-current` while
 * there are pages and the control's page, floored, is the effective page.
 */
function current(context: PaginationContext, options: () => OrigamiPaginationItemOptions) {
  return computed(() => {
    const hasPages = context.pageCount() > 0;

    return hasPages && Math.floor(options().page()) === context.page();
  });
}

/**
 * A numbered page button that writes its page; composes `ogButton`, so it is a native
 * `type="button"`. `aria-current="page"` and empty `data-current` mark the effective page. Its
 * target is its page, floored, while that is one of the pages; otherwise it is disabled but
 * focusable (`aria-disabled="true"`, `data-disabled`). A click, Enter or Space reads the root at
 * the event and writes the target to `page` once, unless the target `===` the requested page: the
 * marked item of a settled pager writes nothing, while the marked item of a stale request (7 of 5
 * pages, marked 5) writes 5. Focus stays on the button.
 *
 * Render one per page record of `state.range()`, tracked by `item.key`, and give it an
 * accessible name such as `aria-label="Page 3"`. Requires a nearest Pagination root.
 */
@Directive({
  selector: "button[ogPaginationItem]",
  hostDirectives: [OrigamiButton],
  providers: [
    OrigamiPaginationItemOptions.provideExisting(() => OrigamiPaginationItem),
    OrigamiButtonOptions.provideFactory(() => {
      const context = inject(PaginationContext);
      const options = injectDeferred(OrigamiPaginationItemOptions);

      return {
        disabled: computed(() => pageTarget(options().page(), context.pageCount()) === null),
        focusableWhenDisabled: signal(true).asReadonly(),
      };
    }),
  ],
  host: {
    "[attr.aria-current]": "currentAria()",
    "[attr.data-current]": "currentAttribute()",
    "(click)": "clicked()",
  },
})
export class OrigamiPaginationItem implements OrigamiPaginationItemOptions {
  /**
   * Own page, required, with number-attribute coercion (`page="3"`); its write type admits a
   * number or a string attribute, not `null` or `undefined`. Replaced Options supply the
   * effective page instead; a composer still exposes and binds this input.
   */
  readonly page = input.required<number, number | string>({ transform: numberAttribute });

  readonly #context = inject(PaginationContext);
  readonly #options = injectDeferred(OrigamiPaginationItemOptions);
  readonly #current = current(this.#context, this.#options);

  /** @internal The current mark. */
  protected readonly currentAria = computed(() => {
    if (this.#current()) {
      return "page";
    }

    return null;
  });
  /** @internal The current marker. */
  protected readonly currentAttribute = computed(() => {
    if (this.#current()) {
      return "";
    }

    return null;
  });

  /** @internal Writes the page under the write rule, read at the event. */
  protected clicked(): void {
    this.#context.write(pageTarget(this.#options().page(), this.#context.pageCount()));
  }
}

/**
 * A numbered page link the consumer's router drives: it only gets marked, with
 * `aria-current="page"` and empty `data-current` on the effective page. It never writes `page`,
 * never touches `href`, `routerLink`, `target` or `download`, has no disabled state (an anchor
 * can't cancel `routerLink`) and adds no listener; bind the root's `page` from the activated route,
 * so the mark moves when the router activates the new page. Ctrl/Cmd-click and middle clicks
 * stay the browser's.
 *
 * Render one per page record of `state.range()`, tracked by `item.key`. Requires a nearest
 * Pagination root.
 */
@Directive({
  selector: "a[ogPaginationLink]",
  providers: [OrigamiPaginationItemOptions.provideExisting(() => OrigamiPaginationLink)],
  host: {
    "[attr.aria-current]": "currentAria()",
    "[attr.data-current]": "currentAttribute()",
  },
})
export class OrigamiPaginationLink implements OrigamiPaginationItemOptions {
  /**
   * Own page, required, with number-attribute coercion (`page="3"`); its write type admits a
   * number or a string attribute, not `null` or `undefined`. Replaced Options supply the
   * effective page instead; a composer still exposes and binds this input.
   */
  readonly page = input.required<number, number | string>({ transform: numberAttribute });

  readonly #current = current(
    inject(PaginationContext),
    injectDeferred(OrigamiPaginationItemOptions),
  );

  /** @internal The current mark. */
  protected readonly currentAria = computed(() => {
    if (this.#current()) {
      return "page";
    }

    return null;
  });
  /** @internal The current marker. */
  protected readonly currentAttribute = computed(() => {
    if (this.#current()) {
      return "";
    }

    return null;
  });
}

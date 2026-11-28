import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { PaginationContext } from "./pagination-context";
import type { OrigamiPaginationRecord } from "./pagination-math";

/**
 * Locally provided readonly facade for the nearest Pagination root; nested roots have independent
 * owners. It reports the derived facts, not the raw Options; the consumer already holds those.
 *
 * Inject it anywhere, but evaluate its signals late: in a template or host binding inside or after
 * the root, a composer's template, a lazy `computed`, `ngOnInit` or later. They read the root's
 * required `total` and `pageSize`, which Angular sets on a bound root only when change detection
 * reaches it, so an evaluation in a constructor or field initializer, or in a template binding
 * placed before the root, throws NG0950.
 */
@Service({ autoProvided: false })
export class OrigamiPaginationState {
  readonly #context = inject(PaginationContext);

  /**
   * The effective page: the requested `page` floored and clamped to `[1, max(1, pageCount)]`, 1
   * when it isn't finite. The current mark, the steps and the range follow it.
   */
  readonly page: Signal<number> = this.#context.page;
  /** The number of pages, `ceil(total ÷ pageSize)` of the effective values; 0 with no items. */
  readonly pageCount: Signal<number> = this.#context.pageCount;
  /**
   * The first item of the requested page, from 1: `(page − 1) × pageSize + 1` for the requested
   * page floored, while it is one of the pages; 0 otherwise, as for a stale page or no items.
   */
  readonly from: Signal<number> = this.#context.from;
  /**
   * The last item of the requested page, `min(page × pageSize, total)`, while it is one of the
   * pages; 0 otherwise. Branch a "Showing x–y of z" summary on `to() > 0`.
   */
  readonly to: Signal<number> = this.#context.to;
  /** The page before the effective one, or null on the first page and with no pages. */
  readonly previous: Signal<number | null> = this.#context.previous;
  /** The page after the effective one, or null on the last page and with no pages. */
  readonly next: Signal<number | null> = this.#context.next;
  /**
   * The pages to render around the effective page, with gaps, in at most
   * `min(pageCount, 2·siblings + 2·boundaries + 3)` entries; empty with no pages. Track it by
   * `item.key`.
   */
  readonly range: Signal<readonly OrigamiPaginationRecord[]> = this.#context.range;
}

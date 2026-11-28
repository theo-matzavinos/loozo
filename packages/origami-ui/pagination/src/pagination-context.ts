import { Service, computed } from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import {
  effectiveCount,
  effectivePage,
  itemBounds,
  pageCount,
  paginationRange,
  stepTarget,
  writes,
} from "./pagination-math";
import { OrigamiPaginationOptions } from "./pagination-options";

/**
 * @internal The Pagination root's private owner: every derived fact, computed from the effective
 * Options, and the one write to `page`. It reads no layout, DOM or registration.
 */
@Service({ autoProvided: false })
export class PaginationContext {
  readonly #options = injectDeferred(OrigamiPaginationOptions);

  /** The raw requested page, as the Options hold it. */
  readonly requested = computed(() => this.#options().page());
  /** The number of pages; 0 with no items. */
  readonly pageCount = computed(() =>
    pageCount(this.#options().total(), this.#options().pageSize()),
  );
  /** The requested page floored and clamped to the pages; 1 when it isn't finite. */
  readonly page = computed(() => effectivePage(this.requested(), this.pageCount()));
  /** The requested page's item bounds. */
  readonly #bounds = computed(() =>
    itemBounds(this.requested(), this.#options().total(), this.#options().pageSize()),
  );
  /** The first item of the requested page; 0 when it has none. */
  readonly from = computed(() => this.#bounds().from);
  /** The last item of the requested page; 0 when it has none. */
  readonly to = computed(() => this.#bounds().to);
  /** The page before the effective one, or null. */
  readonly previous = computed(() => stepTarget("previous", this.page(), this.pageCount()));
  /** The page after the effective one, or null. */
  readonly next = computed(() => stepTarget("next", this.page(), this.pageCount()));
  /** The fixed-slot range around the effective page. */
  readonly range = computed(() =>
    paginationRange(
      this.page(),
      this.pageCount(),
      effectiveCount(this.#options().siblings()),
      effectiveCount(this.#options().boundaries()),
    ),
  );

  /**
   * Writes `target` to `page` under the write rule, read at the call: nothing when there is no
   * target or it is `===` the requested page.
   */
  write(target: number | null): void {
    if (!writes(target, this.requested())) {
      return;
    }

    this.#options().page.set(target);
  }
}

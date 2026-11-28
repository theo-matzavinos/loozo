import { Directive, inject, input, model, numberAttribute } from "@angular/core";
import { PaginationContext } from "./pagination-context";
import { OrigamiPaginationOptions } from "./pagination-options";
import { OrigamiPaginationState } from "./pagination-state";

/**
 * Pagination root: owns the requested page of a paged list and derives the page count, the
 * effective page, the requested page's item bounds and a fixed-slot range of pages with gaps from
 * the consumer's `page`, item `total` and `pageSize`. Page items (`ogPaginationItem`) and the
 * First, Previous, Next and Last steps write `page`; page links (`ogPaginationLink`) only get
 * marked, because the router owns their destination. Nothing is validated, thrown or logged, and
 * `page` is never corrected: an out-of-range request marks and steps from the clamped page.
 *
 * It binds nothing on its host. The consumer owns the landmark (`<nav aria-label>`), every
 * accessible name, the gaps' `aria-hidden` markup, the "Showing x–y of z" text and all styling;
 * there are no built-in strings.
 *
 * @example
 * ```html
 * <nav aria-label="Results pages" ogPagination [(page)]="page" [total]="total()" [pageSize]="20"
 *      #pager="ogPagination">
 *   <button ogPaginationPrevious aria-label="Previous page">‹</button>
 *   @for (item of pager.state.range(); track item.key) {
 *     @if (item.type === "page") {
 *       <button ogPaginationItem [page]="item.page" [attr.aria-label]="'Page ' + item.page">
 *         {{ item.page }}
 *       </button>
 *     } @else {
 *       <span aria-hidden="true">…</span>
 *     }
 *   }
 *   <button ogPaginationNext aria-label="Next page">›</button>
 * </nav>
 * ```
 */
@Directive({
  selector: "[ogPagination]",
  exportAs: "ogPagination",
  providers: [
    OrigamiPaginationOptions.provideExisting(() => OrigamiPagination),
    PaginationContext,
    OrigamiPaginationState,
  ],
})
export class OrigamiPagination implements OrigamiPaginationOptions {
  /**
   * Own requested page model, default 1. `pageChange` emits once for each page a part writes; a
   * part whose target `===` the current value writes nothing and emits nothing. A new value
   * through the incoming `[page]` or `[(page)]` binding emits nothing; calling `.set()` or
   * `.update()` on this model yourself emits, as with any Angular model. Bind it two-way to a
   * writable signal (`[(page)]`) when the pager owns its page; when the route owns it, use
   * `ogPaginationLink` and bind `[page]` from the route. Replaced Options supply the effective
   * writable page instead, and a part's write to a replacement's plain signal emits nothing from
   * this unused model.
   */
  readonly page = model(1);
  /**
   * Own item total, required: its write type admits a number or a string attribute, not `null` or
   * `undefined`, so bind 0 or render your own placeholder while the total is unknown. Coerced with
   * `numberAttribute`; a total that isn't a finite count of at least 0 counts as 0, no pages.
   * Replaced Options supply the effective total instead; a composer still exposes and binds this
   * input, because Angular rejects an unexposed required host-directive input.
   */
  readonly total = input.required<number, number | string>({ transform: numberAttribute });
  /**
   * Own page size, required, with number-attribute coercion (`pageSize="20"`); a size below 1 or
   * not finite counts as 1. Replaced Options supply the effective size instead; a composer still
   * exposes and binds this input.
   */
  readonly pageSize = input.required<number, number | string>({ transform: numberAttribute });
  /**
   * Own sibling count, default 1, with number-attribute coercion: the pages on each side of the
   * current page in the range. Replaced Options supply the effective count instead.
   */
  readonly siblings = input<number, number | string>(1, { transform: numberAttribute });
  /**
   * Own boundary count, default 1, with number-attribute coercion: the pages always shown at each
   * end of the range. Replaced Options supply the effective count instead.
   */
  readonly boundaries = input<number, number | string>(1, { transform: numberAttribute });
  /**
   * This root's readonly derived observation, shared with its descendants. Evaluate its signals
   * in a template or host binding inside or after the root, a composer's template, a lazy
   * `computed`, `ngOnInit` or later, never in a constructor, a field initializer or a template
   * binding before the root: they read the required `total` and `pageSize`, which throw NG0950
   * until Angular has set them.
   */
  readonly state = inject(OrigamiPaginationState);
}

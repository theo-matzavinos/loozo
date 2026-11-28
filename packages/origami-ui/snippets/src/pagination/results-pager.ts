import { Component, model } from "@angular/core";
import {
  OrigamiPagination,
  OrigamiPaginationFirst,
  OrigamiPaginationItem,
  OrigamiPaginationLast,
  OrigamiPaginationNext,
  OrigamiPaginationPrevious,
} from "@loozo/origami-ui/pagination";

// A results list's pager that owns its page: numbered page buttons with gaps, First, Previous,
// Next and Last, and a live "Showing x–y of z" summary. The range is tracked by `item.key`, so the
// page button you press keeps focus while the window shifts; at an edge the steps stay focusable,
// marked `aria-disabled`. Both rows wrap in source order, so the pager fits a phone's width. The
// landmark, every name and the summary text are the consumer's.
@Component({
  selector: "app-results-pager",
  imports: [
    OrigamiPagination,
    OrigamiPaginationFirst,
    OrigamiPaginationPrevious,
    OrigamiPaginationItem,
    OrigamiPaginationNext,
    OrigamiPaginationLast,
  ],
  template: `
    <nav
      ogPagination
      #pager="ogPagination"
      aria-label="Results pages"
      [(page)]="page"
      [total]="total()"
      [pageSize]="20"
    >
      <button ogPaginationFirst aria-label="First page">«</button>
      <button ogPaginationPrevious aria-label="Previous page">‹</button>
      <ul>
        @for (item of pager.state.range(); track item.key) {
          @if (item.type === "page") {
            <li>
              <button ogPaginationItem [page]="item.page" [attr.aria-label]="'Page ' + item.page">
                {{ item.page }}
              </button>
            </li>
          } @else {
            <li class="gap" aria-hidden="true">…</li>
          }
        }
      </ul>
      <button ogPaginationNext aria-label="Next page">›</button>
      <button ogPaginationLast aria-label="Last page">»</button>
    </nav>
    <p class="summary" aria-live="polite">
      @if (pager.state.to() > 0) {
        Showing {{ pager.state.from() }}–{{ pager.state.to() }} of {{ total() }}
      } @else {
        No results on page {{ page() }}
      }
    </p>
  `,
  styles: `
    nav,
    ul {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    button {
      min-inline-size: 2rem;
      block-size: 2rem;
      border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
      border-radius: 0.5rem;
      background: transparent;
      color: inherit;
      font: inherit;
    }

    button[data-current] {
      border-color: #60a5fa;
      background: color-mix(in srgb, #60a5fa 25%, transparent);
      font-weight: 700;
    }

    button[data-disabled] {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .gap {
      min-inline-size: 2rem;
      text-align: center;
    }

    .summary {
      opacity: 0.8;
    }
  `,
})
export class ResultsPager {
  /** The page shown, from 1; a page past the end marks the last page and shows no results. */
  readonly page = model(1);
  /** The number of results, 20 to a page; 0 shows no pages. */
  readonly total = model(245);
}

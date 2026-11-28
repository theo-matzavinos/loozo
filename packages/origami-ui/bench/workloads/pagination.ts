import { Component, signal } from "@angular/core";
import {
  OrigamiPagination,
  OrigamiPaginationFirst,
  OrigamiPaginationItem,
  OrigamiPaginationLast,
  OrigamiPaginationNext,
  OrigamiPaginationPrevious,
} from "@loozo/origami-ui/pagination";

@Component({
  selector: "bench-root, bench-pagination",
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
      @for (item of pager.state.range(); track item.key) {
        @if (item.type === "page") {
          <button ogPaginationItem [page]="item.page" [attr.aria-label]="'Page ' + item.page">
            {{ item.page }}
          </button>
        } @else {
          <span aria-hidden="true">…</span>
        }
      }
      <button ogPaginationNext aria-label="Next page">›</button>
      <button ogPaginationLast aria-label="Last page">»</button>
    </nav>
    <p>Showing {{ pager.state.from() }}–{{ pager.state.to() }} of {{ total() }}</p>
  `,
})
export class Workload {
  readonly page = signal(1);
  readonly total = signal(1000);
}

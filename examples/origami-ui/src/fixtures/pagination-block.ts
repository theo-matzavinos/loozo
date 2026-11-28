import { isPlatformBrowser } from "@angular/common";
import { Component, Directive, PLATFORM_ID, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterLink,
} from "@angular/router";
import { filter, map } from "rxjs";
import {
  OrigamiPagination,
  OrigamiPaginationLink,
  OrigamiPaginationNext,
} from "@loozo/origami-ui/pagination";

/**
 * A dormancy marker the fixture owns: `data-block-hydrated` is absent in server HTML and in a
 * still-dehydrated block, and set once the element's block renders in the browser.
 */
@Directive({
  selector: "[blockHydrated]",
  host: { "[attr.data-block-hydrated]": "browser" },
})
export class BlockHydrated {
  protected readonly browser = isPlatformBrowser(inject(PLATFORM_ID)) || null;
}

// PG12, PG13: Pagination roots in the hydrated route component whose parts sit in their own
// `@defer (hydrate on interaction)` blocks, with the controls that change the page outside them,
// so the page changes while a part's block is still dehydrated.
@Component({
  selector: "acceptance-pagination-block-fixture",
  imports: [
    RouterLink,
    OrigamiPagination,
    OrigamiPaginationNext,
    OrigamiPaginationLink,
    BlockHydrated,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach pagination behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <button type="button" data-testid="block-set-6" (click)="page.set(6)">Page 6</button>
    <button type="button" data-testid="block-set-10" (click)="page.set(10)">Page 10</button>
    <output data-testid="block-page">{{ page() }}</output>
    <output data-testid="block-changes">{{ changes().join(",") }}</output>

    <nav
      ogPagination
      data-testid="block-root"
      aria-label="Block pages"
      [(page)]="page"
      total="100"
      pageSize="10"
      (pageChange)="changes.set([...changes(), $event])"
    >
      @defer (hydrate on interaction) {
        <button ogPaginationNext blockHydrated data-testid="block-next-a" aria-label="Next page">
          ›
        </button>
      } @placeholder {
        <span>Deferred Next A</span>
      }
      @defer (hydrate on interaction) {
        <button
          ogPaginationNext
          blockHydrated
          data-testid="block-next-b"
          aria-label="Next page"
          (click)="bClicks.set(bClicks() + 1)"
        >
          ›
        </button>
      } @placeholder {
        <span>Deferred Next B</span>
      }
    </nav>

    <nav
      ogPagination
      #links="ogPagination"
      data-testid="block-links"
      aria-label="Linked block pages"
      [page]="routePage()"
      total="100"
      pageSize="10"
      (pageChange)="linkChanges.set(linkChanges() + 1)"
    >
      @defer (hydrate on interaction) {
        <a
          ogPaginationLink
          blockHydrated
          page="5"
          routerLink="."
          [queryParams]="{ page: 5 }"
          queryParamsHandling="merge"
          data-testid="block-link-5"
          (click)="linkClicks.set(linkClicks() + 1)"
          >5</a
        >
      } @placeholder {
        <span>Deferred link</span>
      }
    </nav>
    <output data-testid="block-route-page">{{ routePage() }}</output>
    <output data-testid="block-link-changes">{{ linkChanges() }}</output>
    <output data-testid="block-navigations">{{ navigations() }}</output>
    <output data-testid="block-b-clicks">{{ bClicks() }}</output>
    <output data-testid="block-link-clicks">{{ linkClicks() }}</output>
    <output data-testid="block-navigation-requests">{{ navigationRequests() }}</output>
  `,
})
export class PaginationBlockFixture {
  readonly attached = signal(false);
  readonly page = signal(3);
  readonly changes = signal<readonly number[]>([]);
  readonly linkChanges = signal(0);
  readonly navigations = signal(0);
  /** Clicks delivered to Next B, whatever Pagination does with them. */
  readonly bClicks = signal(0);
  /** Clicks delivered to the page-5 link. */
  readonly linkClicks = signal(0);
  /** Navigations the router was asked for: each start, and each it skipped as a duplicate. */
  readonly navigationRequests = signal(0);
  readonly routePage = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      map((params) => {
        const page = params.get("page");

        if (page === null) {
          return 1;
        }

        return Number(page);
      }),
    ),
    { initialValue: 1 },
  );

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.navigations.update((count) => count + 1);
      });
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart || event instanceof NavigationSkipped),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.navigationRequests.update((count) => count + 1);
      });
  }
}

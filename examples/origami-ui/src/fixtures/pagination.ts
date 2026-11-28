import { isPlatformBrowser } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  PLATFORM_ID,
  forwardRef,
  inject,
  input,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  ActivatedRoute,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterLink,
} from "@angular/router";
import { filter, map } from "rxjs";
import {
  OrigamiPagination,
  OrigamiPaginationFirst,
  OrigamiPaginationItem,
  OrigamiPaginationItemOptions,
  OrigamiPaginationLast,
  OrigamiPaginationLink,
  OrigamiPaginationNext,
  OrigamiPaginationOptions,
  OrigamiPaginationPrevious,
  OrigamiPaginationState,
} from "@loozo/origami-ui/pagination";

/**
 * A descendant reading its nearest Pagination State through DI: the effective page, the count,
 * the item bounds, the steps' neighbours and the range as text.
 */
@Directive({
  selector: "[paginationStateProbe]",
  exportAs: "paginationStateProbe",
  host: {
    "data-probe": "",
    "[attr.data-state]": "describe()",
  },
})
export class PaginationStateProbe {
  readonly state = inject(OrigamiPaginationState);

  protected describe(): string {
    const state = this.state;
    const range: string[] = [];

    for (const record of state.range()) {
      if (record.type === "page") {
        range.push(String(record.page));
      } else {
        range.push("…");
      }
    }

    return [
      state.page(),
      state.pageCount(),
      `${state.from()}-${state.to()}`,
      `${state.previous()}/${state.next()}`,
      range.join(" "),
    ].join(" | ");
  }
}

/** The four steps in a consumer component's own view, under the nearest root outside it. */
@Component({
  selector: "pagination-steps",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OrigamiPaginationFirst,
    OrigamiPaginationPrevious,
    OrigamiPaginationNext,
    OrigamiPaginationLast,
  ],
  template: `
    <button ogPaginationFirst [attr.data-testid]="prefix() + '-first'" aria-label="First">«</button>
    <button ogPaginationPrevious [attr.data-testid]="prefix() + '-previous'" aria-label="Previous">
      ‹
    </button>
    <button ogPaginationNext [attr.data-testid]="prefix() + '-next'" aria-label="Next">›</button>
    <button ogPaginationLast [attr.data-testid]="prefix() + '-last'" aria-label="Last">»</button>
  `,
})
export class PaginationSteps {
  readonly prefix = input.required<string>();
}

/** Consumer steps composing the four step parts through `hostDirectives`. */
@Directive({ selector: "button[appFirst]", hostDirectives: [OrigamiPaginationFirst] })
export class AppFirst {}

/** A composed Previous step. */
@Directive({ selector: "button[appPrevious]", hostDirectives: [OrigamiPaginationPrevious] })
export class AppPrevious {}

/** A composed Next step. */
@Directive({ selector: "button[appNext]", hostDirectives: [OrigamiPaginationNext] })
export class AppNext {}

/** A composed Last step. */
@Directive({ selector: "button[appLast]", hostDirectives: [OrigamiPaginationLast] })
export class AppLast {}

/** A consumer page button composing the item, exposing its required `page`. */
@Directive({
  selector: "button[appPageButton]",
  hostDirectives: [{ directive: OrigamiPaginationItem, inputs: ["page"] }],
})
export class AppPageButton {}

/** A consumer page link composing the link, exposing its required `page`. */
@Directive({
  selector: "a[appPageLink]",
  hostDirectives: [{ directive: OrigamiPaginationLink, inputs: ["page"] }],
})
export class AppPageLink {}

/** A page button whose factory Options say page 4 over a contradicting exposed own page. */
@Directive({
  selector: "button[appFactoryPageButton]",
  hostDirectives: [{ directive: OrigamiPaginationItem, inputs: ["page: decoyPage"] }],
  providers: [OrigamiPaginationItemOptions.provideFactory(() => ({ page: signal(4) }))],
})
export class AppFactoryPageButton {}

/** A page link whose factory Options say page 4 over a contradicting exposed own page. */
@Directive({
  selector: "a[appFactoryPageLink]",
  hostDirectives: [{ directive: OrigamiPaginationLink, inputs: ["page: decoyPage"] }],
  providers: [OrigamiPaginationItemOptions.provideFactory(() => ({ page: signal(4) }))],
})
export class AppFactoryPageLink {}

/** An abstract page source a consumer provides; a part resolves it by `provideExisting`. */
export abstract class PageSource implements OrigamiPaginationItemOptions {
  abstract readonly page: OrigamiPaginationItemOptions["page"];
}

/** A page button whose existing Options, its own writable page, contradict its exposed own page. */
@Directive({
  selector: "button[appExistingPageButton]",
  exportAs: "appExistingPageButton",
  hostDirectives: [{ directive: OrigamiPaginationItem, inputs: ["page: decoyPage"] }],
  providers: [
    { provide: PageSource, useExisting: forwardRef(() => AppExistingPageButton) },
    OrigamiPaginationItemOptions.provideExisting(() => PageSource),
  ],
})
export class AppExistingPageButton implements PageSource {
  readonly page = signal(2);
}

/** A page link whose existing Options, its own writable page, contradict its exposed own page. */
@Directive({
  selector: "a[appExistingPageLink]",
  exportAs: "appExistingPageLink",
  hostDirectives: [{ directive: OrigamiPaginationLink, inputs: ["page: decoyPage"] }],
  providers: [
    { provide: PageSource, useExisting: forwardRef(() => AppExistingPageLink) },
    OrigamiPaginationItemOptions.provideExisting(() => PageSource),
  ],
})
export class AppExistingPageLink implements PageSource {
  readonly page = signal(2);
}

/**
 * A consumer pager composing the root through `hostDirectives`, exposing its State; its template
 * renders its own range and a probe that injects the same State.
 */
@Component({
  selector: "app-pager",
  exportAs: "appPager",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PaginationStateProbe, AppPageButton, AppFirst, AppPrevious, AppNext, AppLast],
  hostDirectives: [
    {
      directive: OrigamiPagination,
      inputs: ["page", "total", "pageSize"],
      outputs: ["pageChange"],
    },
  ],
  template: `
    <button appFirst data-testid="composer-first" aria-label="First">«</button>
    <button appPrevious data-testid="composer-previous" aria-label="Previous">‹</button>
    @for (item of state.range(); track item.key) {
      @if (item.type === "page") {
        <button appPageButton [page]="item.page" [attr.data-testid]="'composer-page-' + item.page">
          {{ item.page }}
        </button>
      } @else {
        <span aria-hidden="true">…</span>
      }
    }
    <button appNext data-testid="composer-next" aria-label="Next">›</button>
    <button appLast data-testid="composer-last" aria-label="Last">»</button>
    <span paginationStateProbe #probe="paginationStateProbe" data-testid="composer-probe"></span>
    <output data-testid="composer-same-state">{{ probe.state === state }}</output>
  `,
})
export class AppPager {
  /** The composed root's State, as a composer exposes it. */
  readonly state = inject(OrigamiPaginationState);
}

/** Replacement Options state the factory root reads, with a plain writable page. */
@Directive({ selector: "[paginationSettings]", exportAs: "paginationSettings" })
export class PaginationSettings {
  readonly page = signal(3);
  readonly total = signal(95);
  readonly pageSize = signal(10);
  readonly siblings = signal(1);
  readonly boundaries = signal(1);
}

/** A consumer root with factory Options over contradicting exposed own inputs. */
@Directive({
  selector: "[factoryPager]",
  exportAs: "factoryPager",
  hostDirectives: [
    {
      directive: OrigamiPagination,
      inputs: ["page: decoyPage", "total: decoyTotal", "pageSize: decoyPageSize"],
      outputs: ["pageChange: decoyPageChange"],
    },
  ],
  providers: [
    OrigamiPaginationOptions.provideFactory(() => {
      const settings = inject(PaginationSettings);

      return {
        page: settings.page,
        total: settings.total,
        pageSize: settings.pageSize,
        siblings: settings.siblings,
        boundaries: settings.boundaries,
      };
    }),
  ],
})
export class FactoryPager {
  readonly state = inject(OrigamiPaginationState);
}

/** An abstract Options source a consumer provides; Pagination resolves it by `provideExisting`. */
export abstract class PagerSource implements OrigamiPaginationOptions {
  abstract readonly page: OrigamiPaginationOptions["page"];
  abstract readonly total: OrigamiPaginationOptions["total"];
  abstract readonly pageSize: OrigamiPaginationOptions["pageSize"];
  abstract readonly siblings: OrigamiPaginationOptions["siblings"];
  abstract readonly boundaries: OrigamiPaginationOptions["boundaries"];
}

/** A consumer root whose Options are its own record, reached through an abstract class. */
@Directive({
  selector: "[existingPager]",
  exportAs: "existingPager",
  hostDirectives: [
    {
      directive: OrigamiPagination,
      inputs: ["total: decoyTotal", "pageSize: decoyPageSize"],
    },
  ],
  providers: [
    { provide: PagerSource, useExisting: forwardRef(() => ExistingPager) },
    OrigamiPaginationOptions.provideExisting(() => PagerSource),
  ],
})
export class ExistingPager implements PagerSource {
  readonly page = signal(2);
  readonly total = signal(30);
  readonly pageSize = signal(10);
  readonly siblings = signal(0);
  readonly boundaries = signal(0);
}

/** One write of the results root's Options, in one render. */
interface ResultsWrite {
  readonly label: string;
  readonly page: number;
  readonly total: number;
  readonly pageSize: number;
  readonly siblings?: number;
  readonly boundaries?: number;
}

/** The value and range tables (section 39), as writes of the results root's raw Options. */
const resultsWrites: readonly ResultsWrite[] = [
  { label: "1-95-10", page: 1, total: 95, pageSize: 10 },
  { label: "10-95-10", page: 10, total: 95, pageSize: 10 },
  { label: "7-45-10", page: 7, total: 45, pageSize: 10 },
  { label: "1-0-10", page: 1, total: 0, pageSize: 10 },
  { label: "0-95-10", page: 0, total: 95, pageSize: 10 },
  { label: "-3-95-10", page: -3, total: 95, pageSize: 10 },
  { label: "NaN-95-10", page: Number.NaN, total: 95, pageSize: 10 },
  { label: "2.7-95-10", page: 2.7, total: 95, pageSize: 10 },
  { label: "3-95-NaN", page: 3, total: 95, pageSize: Number.NaN },
  { label: "3-95-0", page: 3, total: 95, pageSize: 0 },
  { label: "3-95--5", page: 3, total: 95, pageSize: -5 },
  { label: "1-NaN-10", page: 1, total: Number.NaN, pageSize: 10 },
  { label: "1--1-10", page: 1, total: -1, pageSize: 10 },
  { label: "1-Infinity-10", page: 1, total: Number.POSITIVE_INFINITY, pageSize: 10 },
  { label: "1-2^60-1", page: 1, total: 2 ** 60, pageSize: 1 },
  { label: "last-2^60-1", page: Number.MAX_SAFE_INTEGER, total: 2 ** 60, pageSize: 1 },
  { label: "5-50-10", page: 5, total: 50, pageSize: 10 },
  { label: "7-50-10", page: 7, total: 50, pageSize: 10 },
  { label: "7-5-10", page: 7, total: 5, pageSize: 10 },
  { label: "1.7-5-10", page: 1.7, total: 5, pageSize: 10 },
  { label: "NaN-100-10", page: Number.NaN, total: 100, pageSize: 10 },
  { label: "0-100-10", page: 0, total: 100, pageSize: 10 },
  { label: "-3-100-10", page: -3, total: 100, pageSize: 10 },
  { label: "1-100-10", page: 1, total: 100, pageSize: 10 },
  { label: "4-100-10", page: 4, total: 100, pageSize: 10 },
  { label: "5-100-10", page: 5, total: 100, pageSize: 10 },
  { label: "9-100-10", page: 9, total: 100, pageSize: 10 },
  { label: "10-100-10", page: 10, total: 100, pageSize: 10 },
  { label: "1-7-1", page: 1, total: 7, pageSize: 1 },
  { label: "1-1-1", page: 1, total: 1, pageSize: 1 },
  { label: "50-100-1", page: 50, total: 100, pageSize: 1 },
  { label: "1-10-1-s1b0", page: 1, total: 10, pageSize: 1, siblings: 1, boundaries: 0 },
  { label: "5-10-1-s1b0", page: 5, total: 10, pageSize: 1, siblings: 1, boundaries: 0 },
  { label: "10-10-1-s1b0", page: 10, total: 10, pageSize: 1, siblings: 1, boundaries: 0 },
];

/**
 * `data-client-rendered` is absent in server HTML and set once the browser renders the fixture:
 * the hydration cases hold the deferred dependency that carries it.
 */
@Component({
  selector: "acceptance-pagination-fixture",
  imports: [
    RouterLink,
    OrigamiPagination,
    OrigamiPaginationItem,
    OrigamiPaginationLink,
    OrigamiPaginationFirst,
    OrigamiPaginationPrevious,
    OrigamiPaginationNext,
    OrigamiPaginationLast,
    PaginationStateProbe,
    PaginationSteps,
    AppPager,
    AppPageButton,
    AppPageLink,
    AppFactoryPageButton,
    AppFactoryPageLink,
    AppExistingPageButton,
    AppExistingPageLink,
    PaginationSettings,
    FactoryPager,
    ExistingPager,
  ],
  host: { "[attr.data-client-rendered]": "clientRendered" },
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach pagination behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Results</h2>
      <nav
        ogPagination
        #results="ogPagination"
        data-testid="results"
        aria-label="Results pages"
        [(page)]="page"
        [total]="total()"
        [pageSize]="pageSize()"
        [siblings]="siblings()"
        [boundaries]="boundaries()"
        (pageChange)="recordChange($event)"
      >
        <button ogPaginationFirst data-testid="results-first" aria-label="First page">«</button>
        <button ogPaginationPrevious data-testid="results-previous" aria-label="Previous page">
          ‹
        </button>
        <ul>
          @for (item of results.state.range(); track item.key) {
            <li>
              @if (item.type === "page") {
                <button
                  ogPaginationItem
                  [page]="item.page"
                  [attr.data-testid]="'results-page-' + item.page"
                  [attr.aria-label]="'Page ' + item.page"
                >
                  {{ item.page }}
                </button>
              } @else {
                <span aria-hidden="true" [attr.data-testid]="'results-' + item.key">…</span>
              }
            </li>
          }
        </ul>
        <button ogPaginationNext data-testid="results-next" aria-label="Next page">›</button>
        <button ogPaginationLast data-testid="results-last" aria-label="Last page">»</button>
        <button ogPaginationItem page="11" data-testid="results-invalid" aria-label="Page 11">
          11
        </button>
        <span paginationStateProbe data-testid="results-probe"></span>
      </nav>
      <p data-testid="results-summary">
        @if (results.state.to() > 0) {
          Showing {{ results.state.from() }}–{{ results.state.to() }} of {{ total() }}
        } @else {
          {{ total() }} results
        }
      </p>
      <output data-testid="results-page">{{ page() }}</output>
      <output data-testid="results-changes">{{ changes().join(",") }}</output>
      @for (write of resultsWrites; track write.label) {
        <button
          type="button"
          [attr.data-testid]="'results-set-' + write.label"
          (click)="set(write)"
        >
          {{ write.label }}
        </button>
      }
      <button type="button" data-testid="results-reset-changes" (click)="changes.set([])">
        Reset changes
      </button>
    </section>

    <section>
      <h2>Static</h2>
      <nav
        ogPagination
        data-testid="static"
        aria-label="Static pages"
        [total]="staticTotal()"
        pageSize="10"
      >
        <button ogPaginationItem page="1" data-testid="static-item">1</button>
        <a ogPaginationLink page="1" href="#static" data-testid="static-link">1</a>
      </nav>
      <button type="button" data-testid="static-empty" (click)="staticTotal.set(0)">Empty</button>
      <button type="button" data-testid="static-populate" (click)="staticTotal.set(30)">
        Populate
      </button>
    </section>

    <section>
      <h2>Links</h2>
      <nav
        ogPagination
        #links="ogPagination"
        data-testid="links"
        aria-label="Linked pages"
        [page]="routePage()"
        total="100"
        pageSize="10"
        (pageChange)="linkChanges.set(linkChanges() + 1)"
      >
        @for (item of links.state.range(); track item.key) {
          @if (item.type === "page") {
            <a
              ogPaginationLink
              [page]="item.page"
              routerLink="."
              [queryParams]="{ page: item.page }"
              queryParamsHandling="merge"
              [attr.data-testid]="'links-page-' + item.page"
              (click)="linkClicks.set(linkClicks() + 1)"
              >{{ item.page }}</a
            >
          } @else {
            <span aria-hidden="true">…</span>
          }
        }
      </nav>
      <output data-testid="links-route-page">{{ routePage() }}</output>
      <output data-testid="links-changes">{{ linkChanges() }}</output>
      <output data-testid="links-clicks">{{ linkClicks() }}</output>
      <output data-testid="links-navigation-requests">{{ navigationRequests() }}</output>
    </section>

    <section>
      <h2>Composition</h2>
      <app-pager
        #composer="appPager"
        data-testid="composer"
        aria-label="Composer pages"
        [(page)]="composerPage"
        total="30"
        pageSize="10"
      />
      <output data-testid="composer-page">{{ composerPage() }}</output>
      <output data-testid="composer-state-page">{{ composer.state.page() }}</output>

      <div paginationSettings #settings="paginationSettings">
        <nav
          factoryPager
          #factory="factoryPager"
          data-testid="factory"
          aria-label="Factory pages"
          [decoyPage]="9"
          decoyTotal="1000"
          decoyPageSize="1"
          (decoyPageChange)="decoyChanges.set(decoyChanges() + 1)"
        >
          <pagination-steps prefix="factory" />
          @for (item of factory.state.range(); track item.key) {
            @if (item.type === "page") {
              <button
                ogPaginationItem
                [page]="item.page"
                [attr.data-testid]="'factory-page-' + item.page"
              >
                {{ item.page }}
              </button>
            }
          }
          <span paginationStateProbe data-testid="factory-probe"></span>
        </nav>
        <output data-testid="factory-settings-page">{{ settings.page() }}</output>
        <output data-testid="factory-decoy-changes">{{ decoyChanges() }}</output>
        <button
          type="button"
          data-testid="factory-write-then-next"
          (click)="writeThenStep(settings)"
        >
          Write 1 of 3 pages, then Next
        </button>
      </div>

      <nav
        existingPager
        #existing="existingPager"
        data-testid="existing"
        aria-label="Existing pages"
        decoyTotal="1000"
        decoyPageSize="1"
      >
        <button appPageButton page="1" data-testid="existing-page-1">1</button>
        <button appPageButton page="2" data-testid="existing-page-2">2</button>
        <a appPageLink page="2" href="#existing" data-testid="existing-link-2">2</a>
        <button appFactoryPageButton decoyPage="1" data-testid="existing-factory-item">4?</button>
        <a appFactoryPageLink decoyPage="2" href="#existing" data-testid="existing-factory-link"
          >4?</a
        >
        <button
          appExistingPageButton
          #sourceItem="appExistingPageButton"
          decoyPage="1"
          data-testid="existing-source-item"
        >
          {{ sourceItem.page() }}
        </button>
        <a
          appExistingPageLink
          #sourceLink="appExistingPageLink"
          decoyPage="1"
          href="#existing"
          data-testid="existing-source-link"
          >{{ sourceLink.page() }}</a
        >
        <span paginationStateProbe data-testid="existing-probe"></span>
      </nav>
      <button
        type="button"
        data-testid="existing-sources-3"
        (click)="sourceItem.page.set(3); sourceLink.page.set(3)"
      >
        Sources to page 3
      </button>
      <output data-testid="existing-page">{{ existing.page() }}</output>
      <button type="button" data-testid="existing-write" (click)="existing.page.set(3)">
        Write 3
      </button>
      <button type="button" data-testid="existing-total-40" (click)="existing.total.set(40)">
        Total 40
      </button>

      <nav ogPagination data-testid="outer" aria-label="Outer" total="30" pageSize="10">
        <span paginationStateProbe data-testid="outer-probe"></span>
        <div ogPagination data-testid="inner" [page]="5" total="100" pageSize="10">
          <span paginationStateProbe data-testid="inner-probe"></span>
          <pagination-steps prefix="inner" />
        </div>
        <pagination-steps prefix="outer" />
      </nav>
    </section>
  `,
})
export class PaginationFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);
  readonly page = signal(1);
  readonly total = signal(100);
  readonly pageSize = signal(10);
  readonly siblings = signal(1);
  readonly boundaries = signal(1);
  readonly changes = signal<readonly number[]>([]);
  readonly staticTotal = signal(0);
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
  readonly linkChanges = signal(0);
  /** Clicks delivered to the page links. */
  readonly linkClicks = signal(0);
  /** Navigations the router was asked for: each start, and each it skipped as a duplicate. */
  readonly navigationRequests = signal(0);
  readonly composerPage = signal(1);
  readonly decoyChanges = signal(0);
  protected readonly resultsWrites = resultsWrites;

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationStart || event instanceof NavigationSkipped),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.navigationRequests.update((count) => count + 1);
      });
  }

  /** Records each `pageChange` emission. */
  recordChange(page: number): void {
    this.changes.update((changes) => [...changes, page]);
  }

  /** Writes the raw Options together, in one render. */
  set(write: ResultsWrite): void {
    this.page.set(write.page);
    this.total.set(write.total);
    this.pageSize.set(write.pageSize);
    this.siblings.set(write.siblings ?? 1);
    this.boundaries.set(write.boundaries ?? 1);
  }

  /**
   * Writes the factory root's Options and, in the same turn, before any change detection,
   * clicks its Next: the click reads the new values.
   */
  writeThenStep(settings: PaginationSettings): void {
    settings.total.set(30);
    settings.page.set(1);

    const next = document.querySelector<HTMLButtonElement>('[data-testid="factory-next"]');

    next?.click();
  }
}

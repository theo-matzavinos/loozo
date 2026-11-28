# Pagination

A pager for a paged list: numbered page controls with gaps, and First, Previous, Next and Last. You bind the page, the item total and the page size on a root; Origami derives the page count, the range of pages to show and the requested page's item bounds, marks the current page with `aria-current="page"`, disables the steps at the edges and writes the page when a page button or step is activated. You own the `<nav>` landmark, every accessible name, the gaps' markup, the "Showing x–y of z" text and all styling.

[src/pagination/results-pager.ts](../snippets/src/pagination/results-pager.ts "playground")

| Directive                                                                                         | Configuration                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ogPagination`                                                                                    | `page` model (default `1`), `total: number` (required), `pageSize: number` (required), `siblings` (default `1`), `boundaries` (default `1`); exposes `state` |
| `button[ogPaginationItem]`                                                                        | `page: number` (required); writes it to the root's `page`                                                                                                    |
| `a[ogPaginationLink]`                                                                             | `page: number` (required); only marked: your router writes the page                                                                                          |
| `button[ogPaginationFirst]`, `[ogPaginationPrevious]`, `[ogPaginationNext]`, `[ogPaginationLast]` | none                                                                                                                                                         |

## Buttons: the pager owns its page

```html
<nav
  aria-label="Results pages"
  ogPagination
  [(page)]="page"
  [total]="total()"
  [pageSize]="20"
  #pager="ogPagination"
>
  <button ogPaginationFirst aria-label="First page">«</button>
  <button ogPaginationPrevious aria-label="Previous page">‹</button>
  <ul>
    @for (item of pager.state.range(); track item.key) {
    <li>
      @if (item.type === "page") {
      <button ogPaginationItem [page]="item.page" [attr.aria-label]="'Page ' + item.page">
        {{ item.page }}
      </button>
      } @else {
      <span aria-hidden="true">…</span>
      }
    </li>
    }
  </ul>
  <button ogPaginationNext aria-label="Next page">›</button>
  <button ogPaginationLast aria-label="Last page">»</button>
</nav>
<p aria-live="polite">
  @if (pager.state.to() > 0) { Showing {{ pager.state.from() }}–{{ pager.state.to() }} of {{ total()
  }} } @else { {{ total() }} results }
</p>
```

Bind `page` two-way to a writable signal you own. A page button writes its page and Next, Previous, First and Last write theirs; `pageChange` emits once for each write, and an activation that would write the page already requested writes and emits nothing. A new value arriving through your `[(page)]` or `[page]` binding emits nothing; calling `.set()` on the directive's `page` model yourself emits, as with any Angular model.

**Track the range by `item.key`.** Each page keeps one control while the window shifts, so the button you pressed keeps focus. With `track $index`, the focused button would be reused for another page after the window moves: press 5 from page 1 and the focused button shows 6, and the next Enter goes to 6.

At an edge the steps are disabled but stay focusable: `aria-disabled="true"` and `data-disabled`, no native `disabled`. Press Next onto the last page and focus stays on Next, which a screen reader announces as unavailable; a natively disabled button would drop focus to the page.

## Links: the route owns the page

When the page is in the URL, render page links and bind the root's `page` from the activated route. A page link only gets marked: it never writes `page`, never touches `href`, `routerLink`, `target` or `download`, and has no disabled state, because an anchor can't cancel a `routerLink`. The mark moves when the router activates the new page, so a guard that cancels the navigation leaves the pager where it was, and Ctrl/Cmd-click or a middle click opening a new tab changes nothing here.

```html
<nav
  aria-label="Results pages"
  ogPagination
  [page]="routePage()"
  [total]="total()"
  [pageSize]="20"
  #pager="ogPagination"
>
  @if (pager.state.pageCount() > 0 && routePage() !== 1) {
  <a routerLink="." [queryParams]="{ page: 1 }" queryParamsHandling="merge">First</a>
  } @else {
  <button type="button" disabled>First</button>
  } @if (pager.state.previous(); as previous) {
  <a routerLink="." [queryParams]="{ page: previous }" queryParamsHandling="merge">Previous</a>
  } @else {
  <button type="button" disabled>Previous</button>
  } @for (item of pager.state.range(); track item.key) { @if (item.type === "page") {
  <a
    ogPaginationLink
    [page]="item.page"
    routerLink="."
    [queryParams]="{ page: item.page }"
    queryParamsHandling="merge"
    >{{ item.page }}</a
  >
  } @else {
  <span aria-hidden="true">…</span>
  } } @if (pager.state.next(); as next) {
  <a routerLink="." [queryParams]="{ page: next }" queryParamsHandling="merge">Next</a>
  } @else {
  <button type="button" disabled>Next</button>
  } @if (pager.state.pageCount() > 0 && routePage() !== pager.state.pageCount()) {
  <a routerLink="." [queryParams]="{ page: pager.state.pageCount() }" queryParamsHandling="merge"
    >Last</a
  >
  } @else {
  <button type="button" disabled>Last</button>
  }
</nav>
```

In a link pager every control is your anchor and nothing writes `page`: the steps are your markup too, an anchor while there's a target and a disabled button otherwise. When an activation replaces the anchor, as Previous onto page 1 does, focus falls to the page; that's the cost of rendering no link without a destination. Don't put `ogPaginationPrevious` or the other step buttons in a link pager: they write `page`, so the mark would move while the URL and the rows stay where they were. They belong to a pager that owns its page with `[(page)]`, where they keep focus at the edges.

Don't drive a route-owned page with buttons: a pager bound `[page]="routePage()" (pageChange)="navigate($event)"` keeps the clicked page if the navigation is cancelled, because Angular doesn't push an unchanged parent binding again, so the rows stay on the old page while the pager shows the new one. Every Origami model behaves so. Use links for a page in the URL, and a writable signal bound with `[(page)]` for a page the component owns.

With data loaded per route, the mark moves as soon as the route does, while rows you keep from the previous request (`keepPreviousData`) stay until the response arrives.

## The range

`state.range()` lists the pages to render, with a gap where pages are hidden. Its entries are `{ type: "page", page, key: "page-3" }` or `{ type: "ellipsis", key: "ellipsis-start" | "ellipsis-end" }`. It always has `2·siblings + 2·boundaries + 3` entries once there are more pages than that, so the row never changes length: the first and last `boundaries` pages, a window of `siblings` on each side of the current page, shifted away from an edge, and a gap on each side, where a gap that would hide one page shows that page instead.

| pages | `siblings` / `boundaries` | page     | range                                  |
| ----- | ------------------------- | -------- | -------------------------------------- |
| 10    | 1 / 1                     | 1        | `1 2 3 4 5 … 10`                       |
| 10    | 1 / 1                     | 5        | `1 … 4 5 6 … 10`                       |
| 10    | 1 / 1                     | 10       | `1 … 6 7 8 9 10`                       |
| 10    | 1 / 0                     | 1, 5, 10 | `1 2 3 4 …`, `… 4 5 6 …`, `… 7 8 9 10` |
| 7     | 1 / 1                     | any      | `1 2 3 4 5 6 7`                        |
| 0     | 1 / 1                     | 1        | (empty)                                |

Mark the gap `aria-hidden`: it isn't a control and a reader gains nothing from "…". The range costs as many controls as you ask for: absurd `siblings` or `boundaries` render that many buttons.

## Values

Nothing is validated, thrown or logged, and `page` is never corrected.

- `total` is floored, and anything that isn't a finite count of at least 0 counts as 0: no pages, an empty range, every step disabled and no current mark. Render your own "no results" text.
- `pageSize` is floored, and anything below 1 or not finite counts as 1.
- The effective page is `page` floored and clamped to the pages, 1 when it isn't finite. The mark, the steps and the range follow it.
- `state.from()` and `state.to()` are the requested page's first and last item, 0 and 0 when the requested page isn't one of the pages. Branch your summary on `to() > 0`.

| `page`     | `total`    | `pageSize` | `state.page()` | `pageCount()` | `from()`–`to()` | `previous()` / `next()` |
| ---------- | ---------- | ---------- | -------------- | ------------- | --------------- | ----------------------- |
| 1          | 95         | 10         | 1              | 10            | 1–10            | null / 2                |
| 10         | 95         | 10         | 10             | 10            | 91–95           | 9 / null                |
| 7          | 45         | 10         | 5              | 5             | 0–0             | 4 / null                |
| 1          | 0          | 10         | 1              | 0             | 0–0             | null / null             |
| 0, −3, NaN | 95         | 10         | 1              | 10            | 0–0             | null / 2                |
| 2.7        | 95         | 10         | 2              | 10            | 11–20           | 1 / 3                   |
| 3          | 95         | NaN, 0, −5 | 3              | 95            | 3–3             | 2 / 4                   |
| 1          | NaN, −1, ∞ | 10         | 1              | 0             | 0–0             | null / null             |

A page that went stale, such as page 7 after the total shrank to 5 pages, marks page 5 and reports no items, and the pager offers a way back: in a button pager the marked 5, First, Previous and Last each write a page in range; in a link pager the marked 5's anchor, and page 1's, navigate there, and the route binding brings the pager back. Only a pager that renders no destination back into range needs more, such as one with only Previous and Next at page 7 of 1: show your own "back to page 1" link, or redirect once settled data confirms the shrink. Keep the settled total while a request is pending: a total of 0 empties the range and recreates the controls, and focus falls to the page.

A 0-based page index adapts at the binding: `[page]="index() + 1" (pageChange)="index.set($event - 1)"`. A page-size control is yours too, such as an Origami Select; reset the page when the size changes.

## State

`pager.state` (or `inject(OrigamiPaginationState)` in a descendant) has `page`, `pageCount`, `from`, `to`, `previous`, `next` and `range`, all readonly signals. They read the required `total` and `pageSize`, so evaluate them inside or after the root, in a composer's template, a lazy `computed`, `ngOnInit` or later: in a constructor, a field initializer or a template binding placed before the root they throw NG0950.

## Composition

Compose the root, a page item, a page link or a step into your own directive or component with `hostDirectives`. A root composer must expose and bind `total` and `pageSize`, and an item or link composer `page`, because Angular rejects an unexposed required host-directive input. Replace the root's Options with `OrigamiPaginationOptions.provideExisting` or `provideFactory`, such as a plain writable signal for the page, and an item's or link's with `OrigamiPaginationItemOptions`.

## Server rendering and hydration

The server renders every mark and disabled attribute. Hydration keeps the same nodes while the browser renders the same range entries, and keeps their attributes while the browser's Options equal the server's; a range whose entries changed before it hydrates adds and removes rows as any `@for` does. A part in a separately hydrated `@defer` block keeps the server's attributes while it's dehydrated and switches to the live ones when it hydrates: a Next rendered enabled at page 3 becomes `aria-disabled` if the root reached its last page meanwhile. A click held before hydration is replayed once and acts on the live State. Keep the range in the same hydration unit as its root: if the root hydrates and its page, total, page size, siblings or boundaries change while the range's `@defer` block is still dehydrated, Angular reuses the block's server nodes in order and replays the click on a node that may now stand for another page.

## Not included

No landmark or labels, no ellipsis, list or summary part, no page-size control, no root `disabled`, no arrow-key navigation (every control is a Tab stop), no generated URLs, no 0-based mode and no event beyond `pageChange`. The contract is SPEC section 39.

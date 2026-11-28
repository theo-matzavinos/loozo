// Pagination's package-private arithmetic: input normalization, the page count, the effective
// page, the requested page's item bounds, the controls' target pages and the fixed-slot range.
// Framework-free, so the Node checks import it from source; no entry point exports it.

/**
 * One entry of a Pagination range: a page, or a gap standing for at least two hidden pages. `key`
 * is stable per page and per gap side, so `@for (item of pager.state.range(); track item.key)`
 * keeps each page's control, and its focus, while the window shifts; tracking by `$index` would
 * hand the focused control another page.
 */
export type OrigamiPaginationRecord =
  | {
      /** A page: render a page control, `ogPaginationItem` or `ogPaginationLink`, for it. */
      readonly type: "page";
      /** The page number, from 1. */
      readonly page: number;
      /** `page-` followed by the page number. */
      readonly key: `page-${number}`;
    }
  | {
      /** A gap: render an `aria-hidden` mark, such as `…`, not a control. */
      readonly type: "ellipsis";
      /** Which side of the current page's window the gap is on. */
      readonly key: "ellipsis-start" | "ellipsis-end";
    };

/** A step control's direction. */
export type PaginationStep = "first" | "previous" | "next" | "last";

/** The item total: floored when finite and at least 0, at most the largest safe integer; else 0. */
export function effectiveTotal(total: number): number {
  const isCount = Number.isFinite(total) && total >= 0;

  if (!isCount) {
    return 0;
  }

  return Math.min(Math.floor(total), Number.MAX_SAFE_INTEGER);
}

/** The page size: floored when finite and at least 1; else 1. A size past the safe range stays. */
export function effectivePageSize(pageSize: number): number {
  const isSize = Number.isFinite(pageSize) && pageSize >= 1;

  if (!isSize) {
    return 1;
  }

  return Math.floor(pageSize);
}

/** A sibling or boundary count: floored when finite, at least 0; 1 when it isn't finite. */
export function effectiveCount(count: number): number {
  if (!Number.isFinite(count)) {
    return 1;
  }

  return Math.max(0, Math.floor(count));
}

/** `ceil(total ÷ pageSize)` of the effective values, at most the largest safe integer. */
export function pageCount(total: number, pageSize: number): number {
  return Math.min(
    Math.ceil(effectiveTotal(total) / effectivePageSize(pageSize)),
    Number.MAX_SAFE_INTEGER,
  );
}

/** The requested page floored, clamped to `[1, max(1, count)]`; 1 when it isn't finite. */
export function effectivePage(requested: number, count: number): number {
  if (!Number.isFinite(requested)) {
    return 1;
  }

  return Math.min(Math.max(1, Math.floor(requested)), Math.max(1, count));
}

/** A floored page number while it is one of `count` pages, else null. */
export function pageTarget(page: number, count: number): number | null {
  const floored = Math.floor(page);
  const isPage = floored >= 1 && floored <= count;

  if (!isPage) {
    return null;
  }

  return floored;
}

/**
 * The first and last item of the requested page, 1-based: the items the consumer's request for
 * that page returns. Both 0 while the requested page, floored, isn't one of the pages.
 */
export function itemBounds(
  requested: number,
  total: number,
  pageSize: number,
): { readonly from: number; readonly to: number } {
  const items = effectiveTotal(total);
  const size = effectivePageSize(pageSize);
  const page = pageTarget(requested, pageCount(total, pageSize));

  if (page === null) {
    return { from: 0, to: 0 };
  }

  return { from: (page - 1) * size + 1, to: Math.min(page * size, items) };
}

/** A step's target page around the effective page, or null when it has none. */
export function stepTarget(step: PaginationStep, page: number, count: number): number | null {
  if (count === 0) {
    return null;
  }

  if (step === "first") {
    return 1;
  }

  if (step === "last") {
    return count;
  }

  if (step === "previous") {
    if (page - 1 < 1) {
      return null;
    }

    return page - 1;
  }

  if (page + 1 > count) {
    return null;
  }

  return page + 1;
}

/**
 * The write rule: a control writes its target unless it has none or the target is the raw
 * requested page (`===`, so a `NaN` request is never equal; Angular's model compares with
 * `Object.is`, which agrees with `===` for the integer targets a control can have).
 */
export function writes(target: number | null, requested: number): target is number {
  return target !== null && target !== requested;
}

function pageRecord(page: number): OrigamiPaginationRecord {
  return { type: "page", page, key: `page-${page}` };
}

/**
 * The fixed-slot range around the effective `page` of `count` pages: every page while they fit in
 * `2·siblings + 2·boundaries + 3` slots; otherwise the first `boundaries` pages, a start gap, a
 * window of `siblings` on each side of the page shifted away from an edge to keep the slot count,
 * an end gap and the last `boundaries` pages, where a gap that would hide one page shows it.
 */
export function paginationRange(
  page: number,
  count: number,
  siblings: number,
  boundaries: number,
): OrigamiPaginationRecord[] {
  const range: OrigamiPaginationRecord[] = [];
  const slots = 2 * siblings + 2 * boundaries + 3;

  if (count <= slots) {
    for (let current = 1; current <= count; current++) {
      range.push(pageRecord(current));
    }

    return range;
  }

  for (let current = 1; current <= boundaries; current++) {
    range.push(pageRecord(current));
  }

  const windowStart = Math.max(
    Math.min(page - siblings, count - boundaries - 2 * siblings - 1),
    boundaries + 2,
  );
  const windowEnd = Math.min(
    Math.max(page + siblings, boundaries + 2 * siblings + 2),
    count - boundaries - 1,
  );
  const hidesStart = windowStart > boundaries + 2;
  const hidesEnd = windowEnd < count - boundaries - 1;

  if (hidesStart) {
    range.push({ type: "ellipsis", key: "ellipsis-start" });
  } else {
    range.push(pageRecord(boundaries + 1));
  }

  for (let current = windowStart; current <= windowEnd; current++) {
    range.push(pageRecord(current));
  }

  if (hidesEnd) {
    range.push({ type: "ellipsis", key: "ellipsis-end" });
  } else {
    range.push(pageRecord(count - boundaries));
  }

  for (let current = count - boundaries + 1; current <= count; current++) {
    range.push(pageRecord(current));
  }

  return range;
}

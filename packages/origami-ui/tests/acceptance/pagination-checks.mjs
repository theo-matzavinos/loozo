import assert from "node:assert/strict";
import { once } from "node:events";
import { Worker } from "node:worker_threads";

// PG1 in Node: Pagination's package-private arithmetic, through its framework-free source, which no
// entry point exports: section 39's two value tables, the controls' targets under the write rule
// and the range's invariants. Every range over the safe-integer limit is evaluated first, in a
// worker with a time and memory bound, so a range loop that stops making progress at an unsafe
// count fails this check instead of hanging it; no range on this thread sees such a count.
// Resolved from this file, so the check runs from the package or from the repository root.
const source = new URL("../../pagination/src/pagination-math.ts", import.meta.url).href;
const bound = 10_000;
const worker = new Worker(
  `
    const { parentPort, workerData } = require("node:worker_threads");

    import(workerData).then((math) => {
      function show(page, count) {
        const shown = [];

        for (const record of math.paginationRange(page, count, 1, 1)) {
          shown.push(record.type === "page" ? record.page : record.key);
        }

        return shown;
      }

      const count = math.pageCount(2 ** 60, 1);
      const page = math.effectivePage(count, count);

      parentPort.postMessage({
        count,
        exact: math.pageCount(2 ** 53, 1),
        page,
        first: show(1, count),
        last: show(page, count),
        next: math.stepTarget("next", page, count),
        previous: math.stepTarget("previous", page, count),
      });
    });
  `,
  { eval: true, workerData: source, resourceLimits: { maxOldGenerationSizeMb: 128 } },
);
const timer = setTimeout(() => {
  void worker.terminate();
}, bound);
const [message] = await Promise.race([
  once(worker, "message"),
  once(worker, "exit").then(([code]) => {
    throw new Error(
      `The safe-limit ranges didn't finish within ${bound} ms and 128 MB (worker exit ${code}).`,
    );
  }),
  once(worker, "error").then(([error]) => {
    throw new Error(`The safe-limit ranges failed in their worker: ${String(error)}`);
  }),
]);

clearTimeout(timer);
await worker.terminate();

const last = Number.MAX_SAFE_INTEGER;

assert.deepEqual(
  message,
  {
    count: last,
    exact: last,
    page: last,
    first: [1, 2, 3, 4, 5, "ellipsis-end", last],
    last: [1, "ellipsis-start", last - 4, last - 3, last - 2, last - 1, last],
    next: null,
    previous: last - 1,
  },
  "2^53 − 1 pages at most: the first page, then the last, each with its side's gap",
);

const math = await import(source);

/** The range as text: page numbers and `…` for each gap. */
function show(range) {
  const parts = [];

  for (const record of range) {
    if (record.type === "page") {
      parts.push(String(record.page));
    } else {
      parts.push("…");
    }
  }

  return parts.join(" ");
}

/**
 * The root's derived facts for one set of raw Options, without the range: a values row may have
 * up to 2^53 − 1 pages, whose ranges only the bounded worker above evaluates.
 */
function derive({ page, total, pageSize }) {
  const count = math.pageCount(total, pageSize);
  const effective = math.effectivePage(page, count);
  const bounds = math.itemBounds(page, total, pageSize);

  return {
    page: effective,
    pageCount: count,
    from: bounds.from,
    to: bounds.to,
    previous: math.stepTarget("previous", effective, count),
    next: math.stepTarget("next", effective, count),
  };
}

/** The range of a small page count as text. */
function range({ page, total, pageSize, siblings = 1, boundaries = 1 }) {
  const count = math.pageCount(total, pageSize);

  assert.ok(count <= 1000, "range() is for small counts; the worker owns the limit");

  return show(
    math.paginationRange(
      math.effectivePage(page, count),
      count,
      math.effectiveCount(siblings),
      math.effectiveCount(boundaries),
    ),
  );
}

/** The gap keys of a range, in order. */
function gapKeys(page, count, siblings, boundaries) {
  const keys = [];

  for (const record of math.paginationRange(page, count, siblings, boundaries)) {
    if (record.type === "ellipsis") {
      keys.push(record.key);
    }
  }

  return keys;
}

// The range table (section 39), with ten pages of one item each.
const rangeRows = [
  [10, 1, 1, 1, "1 2 3 4 5 … 10"],
  [10, 1, 1, 4, "1 2 3 4 5 … 10"],
  [10, 1, 1, 5, "1 … 4 5 6 … 10"],
  [10, 1, 1, 10, "1 … 6 7 8 9 10"],
  [10, 1, 0, 1, "1 2 3 4 …"],
  [10, 1, 0, 5, "… 4 5 6 …"],
  [10, 1, 0, 10, "… 7 8 9 10"],
  [7, 1, 1, 1, "1 2 3 4 5 6 7"],
  [7, 1, 1, 4, "1 2 3 4 5 6 7"],
  [7, 1, 1, 7, "1 2 3 4 5 6 7"],
  [1, 1, 1, 1, "1"],
  [0, 1, 1, 1, ""],
  [100, 1, 1, 50, "1 … 49 50 51 … 100"],
];

for (const [pages, siblings, boundaries, page, expected] of rangeRows) {
  assert.equal(
    range({ page, total: pages, pageSize: 1, siblings, boundaries }),
    expected,
    `range of ${pages} pages, ${siblings}/${boundaries}, page ${page}`,
  );
}

// Each gap's key names its side: an end gap alone, a start gap alone, and both.
assert.deepEqual(gapKeys(1, 10, 1, 1), ["ellipsis-end"], "page 1 of 10: an end gap only");
assert.deepEqual(gapKeys(10, 10, 1, 1), ["ellipsis-start"], "page 10 of 10: a start gap only");
assert.deepEqual(gapKeys(5, 10, 1, 1), ["ellipsis-start", "ellipsis-end"], "page 5 of 10: both");
assert.deepEqual(gapKeys(1, 10, 1, 0), ["ellipsis-end"], "page 1 of 10, no boundaries: an end gap");
assert.deepEqual(gapKeys(10, 10, 1, 0), ["ellipsis-start"], "page 10 of 10, no boundaries");

// Sibling and boundary normalization: floored, negative 0, not finite 1.
assert.equal(math.effectiveCount(2.9), 2);
assert.equal(math.effectiveCount(-3), 0);
assert.equal(math.effectiveCount(Number.NaN), 1);
assert.equal(math.effectiveCount(Number.POSITIVE_INFINITY), 1);

// The values table (section 39).
const big = 2 ** 60;
const valueRows = [
  [{ page: 1, total: 95, pageSize: 10 }, [1, 10, 1, 10, null, 2]],
  [{ page: 10, total: 95, pageSize: 10 }, [10, 10, 91, 95, 9, null]],
  [{ page: 7, total: 45, pageSize: 10 }, [5, 5, 0, 0, 4, null]],
  [{ page: 1, total: 0, pageSize: 10 }, [1, 0, 0, 0, null, null]],
  [{ page: 0, total: 95, pageSize: 10 }, [1, 10, 0, 0, null, 2]],
  [{ page: -3, total: 95, pageSize: 10 }, [1, 10, 0, 0, null, 2]],
  [{ page: Number.NaN, total: 95, pageSize: 10 }, [1, 10, 0, 0, null, 2]],
  [{ page: 2.7, total: 95, pageSize: 10 }, [2, 10, 11, 20, 1, 3]],
  [{ page: 3, total: 95, pageSize: Number.NaN }, [3, 95, 3, 3, 2, 4]],
  [{ page: 3, total: 95, pageSize: 0 }, [3, 95, 3, 3, 2, 4]],
  [{ page: 3, total: 95, pageSize: -5 }, [3, 95, 3, 3, 2, 4]],
  [{ page: 1, total: Number.NaN, pageSize: 10 }, [1, 0, 0, 0, null, null]],
  [{ page: 1, total: -1, pageSize: 10 }, [1, 0, 0, 0, null, null]],
  [{ page: 1, total: Number.POSITIVE_INFINITY, pageSize: 10 }, [1, 0, 0, 0, null, null]],
  [{ page: 1, total: big, pageSize: 1 }, [1, Number.MAX_SAFE_INTEGER, 1, 1, null, 2]],
  // Fractional counts floor on their own: 10.5 items are 10, so five to a page make 2 pages and
  // a request for page 3 has no items (an unfloored total would make a third page of 10.5).
  [{ page: 3, total: 10.5, pageSize: 5 }, [2, 2, 0, 0, 1, null]],
  // A page size of 2.5 is 2: ten items make 5 pages, page 2 holding items 3–4 (an unfloored size
  // would make 4 pages and fractional bounds).
  [{ page: 2, total: 10, pageSize: 2.5 }, [2, 5, 3, 4, 1, 3]],
  // The item total's own cap: 2^60 items count as 2^53 − 1, so two to a page make 2^52 pages,
  // the last holding one item. Without that cap the page count's cap alone would give 2^53 − 1
  // pages and two items here.
  [
    { page: 2 ** 52, total: big, pageSize: 2 },
    [2 ** 52, 2 ** 52, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 2 ** 52 - 1, null],
  ],
];

for (const [options, [page, pageCount, from, to, previous, next]] of valueRows) {
  const derived = derive(options);

  assert.deepEqual(
    [derived.page, derived.pageCount, derived.from, derived.to, derived.previous, derived.next],
    [page, pageCount, from, to, previous, next],
    `values for ${JSON.stringify(options)} (${String(options.page)}, ${String(options.total)})`,
  );
}

// A finite page size past the safe range stays, giving one page.
assert.deepEqual(derive({ page: 1, total: 5, pageSize: 1e300 }).pageCount, 1);
assert.deepEqual(
  [
    derive({ page: 1, total: 5, pageSize: 1e300 }).from,
    derive({ page: 1, total: 5, pageSize: 1e300 }).to,
  ],
  [1, 5],
);

/**
 * Under the write rule: each step's and the given item's write for one root, `null` where the
 * control writes nothing. An item's target is its floored page while it is a page.
 */
function writesFor({ page, total, pageSize }, item) {
  const count = math.pageCount(total, pageSize);
  const effective = math.effectivePage(page, count);
  const result = {};

  for (const step of ["first", "previous", "next", "last"]) {
    const target = math.stepTarget(step, effective, count);

    result[step] = null;

    if (math.writes(target, page)) {
      result[step] = target;
    }
  }

  const itemTarget = math.pageTarget(item, count);

  result.itemEnabled = itemTarget !== null;
  result.item = null;

  if (math.writes(itemTarget, page)) {
    result.item = itemTarget;
  }

  return result;
}

const writeRows = [
  // 5 of 5: Next and Last disabled; the marked item 5 stays enabled and writes nothing.
  [
    { page: 5, total: 50, pageSize: 10 },
    5,
    { first: 1, previous: 4, next: null, last: null, itemEnabled: true, item: null },
  ],
  // A stale 7 of 5: Next has no target; First, Previous, Last and the marked 5 write back.
  [
    { page: 7, total: 50, pageSize: 10 },
    5,
    { first: 1, previous: 4, next: null, last: 5, itemEnabled: true, item: 5 },
  ],
  // A stale 7 of 1: First, Last and the marked 1 write 1.
  [
    { page: 7, total: 5, pageSize: 10 },
    1,
    { first: 1, previous: null, next: null, last: 1, itemEnabled: true, item: 1 },
  ],
  // 1.7 of one page: the raw request isn't 1, so First, Last and item 1 write 1.
  [
    { page: 1.7, total: 5, pageSize: 10 },
    1,
    { first: 1, previous: null, next: null, last: 1, itemEnabled: true, item: 1 },
  ],
  // NaN, 0 and −3 of 10 mark page 1 and write into range.
  [
    { page: Number.NaN, total: 100, pageSize: 10 },
    1,
    { first: 1, previous: null, next: 2, last: 10, itemEnabled: true, item: 1 },
  ],
  [
    { page: 0, total: 100, pageSize: 10 },
    1,
    { first: 1, previous: null, next: 2, last: 10, itemEnabled: true, item: 1 },
  ],
  [
    { page: -3, total: 100, pageSize: 10 },
    1,
    { first: 1, previous: null, next: 2, last: 10, itemEnabled: true, item: 1 },
  ],
  // First, middle and last of 10.
  [
    { page: 1, total: 100, pageSize: 10 },
    3,
    { first: null, previous: null, next: 2, last: 10, itemEnabled: true, item: 3 },
  ],
  [
    { page: 5, total: 100, pageSize: 10 },
    5,
    { first: 1, previous: 4, next: 6, last: 10, itemEnabled: true, item: null },
  ],
  [
    { page: 10, total: 100, pageSize: 10 },
    9,
    { first: 1, previous: 9, next: null, last: null, itemEnabled: true, item: 9 },
  ],
  // No items: every step and every item is disabled.
  [
    { page: 1, total: 0, pageSize: 10 },
    1,
    { first: null, previous: null, next: null, last: null, itemEnabled: false, item: null },
  ],
  // An item outside the pages, fractional item pages floored.
  [
    { page: 1, total: 100, pageSize: 10 },
    11,
    { first: null, previous: null, next: 2, last: 10, itemEnabled: false, item: null },
  ],
  [
    { page: 1, total: 100, pageSize: 10 },
    3.9,
    { first: null, previous: null, next: 2, last: 10, itemEnabled: true, item: 3 },
  ],
  [
    { page: 1, total: 100, pageSize: 10 },
    Number.NaN,
    { first: null, previous: null, next: 2, last: 10, itemEnabled: false, item: null },
  ],
];

for (const [options, item, expected] of writeRows) {
  assert.deepEqual(
    writesFor(options, item),
    expected,
    `writes for page ${String(options.page)} of ${options.total}/${options.pageSize}, item ${Number(item).toString()}`,
  );
}

// The range invariants over 0–60 pages, siblings and boundaries 0–4, every page: the slot count,
// the current page, its siblings and the boundaries present, ascending contiguous runs, each gap
// hiding at least two pages, and stable unique keys.
let checked = 0;

for (let count = 0; count <= 60; count++) {
  for (let siblings = 0; siblings <= 4; siblings++) {
    for (let boundaries = 0; boundaries <= 4; boundaries++) {
      const slots = Math.min(count, 2 * siblings + 2 * boundaries + 3);

      for (let page = 1; page <= Math.max(1, count); page++) {
        const label = `${count} pages, ${siblings}/${boundaries}, page ${page}`;
        const range = math.paginationRange(page, count, siblings, boundaries);
        const pages = [];
        const keys = new Set();

        assert.equal(range.length, slots, `${label}: slot count`);

        for (const record of range) {
          keys.add(record.key);

          if (record.type === "page") {
            assert.equal(record.key, `page-${record.page}`, `${label}: page key`);
            pages.push(record.page);
          }
        }

        assert.equal(keys.size, range.length, `${label}: unique keys`);

        for (let index = 1; index < pages.length; index++) {
          assert.ok(pages[index] > pages[index - 1], `${label}: ascending`);
        }

        if (count > 0) {
          for (let near = page - siblings; near <= page + siblings; near++) {
            if (near >= 1 && near <= count) {
              assert.ok(pages.includes(near), `${label}: page ${near} present`);
            }
          }

          for (let edge = 1; edge <= Math.min(boundaries, count); edge++) {
            assert.ok(pages.includes(edge), `${label}: boundary ${edge}`);
            assert.ok(pages.includes(count - edge + 1), `${label}: boundary ${count - edge + 1}`);
          }
        }

        for (let index = 0; index < range.length; index++) {
          const record = range[index];
          const previous = range[index - 1];
          const next = range[index + 1];

          if (record.type === "ellipsis") {
            let before = 0;
            let after = count + 1;

            if (previous !== undefined) {
              assert.equal(previous.type, "page", `${label}: gap after a page`);
              before = previous.page;
            }

            if (next !== undefined) {
              assert.equal(next.type, "page", `${label}: gap before a page`);
              after = next.page;
            }

            assert.ok(after - before - 1 >= 2, `${label}: a gap hides at least two pages`);
          } else if (previous?.type === "page") {
            assert.equal(record.page, previous.page + 1, `${label}: contiguous run`);
          }
        }

        checked++;
      }
    }
  }
}

console.log(`Pagination math checks passed (${checked} ranges).`);

// The Origami runtime bench's metric registry: each key's label, unit, class, statistic and budget
// rule. Times are milliseconds, heap sizes bytes. See bench/README.md for what each metric means and
// tools/bench/README.md for the fields.
export const metrics = [
  {
    key: "mount.p50Ms",
    label: "Mount",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 0.1],
  },
  // A p95 over 10 samples is their maximum, so it isn't budgeted.
  {
    key: "mount.p95Ms",
    label: "Mount p95",
    unit: "ms",
    deterministic: false,
    statistic: "p95",
    budget: null,
  },
  {
    key: "hydration.p50Ms",
    label: "Hydration",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 0.1],
  },
  {
    key: "hydration.p95Ms",
    label: "Hydration p95",
    unit: "ms",
    deterministic: false,
    statistic: "p95",
    budget: null,
  },
  {
    key: "open.p50Ms",
    label: "Open",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 0.1],
  },
  {
    key: "open.p95Ms",
    label: "Open p95",
    unit: "ms",
    deterministic: false,
    statistic: "p95",
    budget: [1.5, 0.1],
  },
  // Tooltip's open p95 moves by several timer ticks between runs over an identical median, so it's
  // shown but never budgeted.
  {
    key: "open.p95UnbudgetedMs",
    label: "Open p95 (unbudgeted)",
    unit: "ms",
    deterministic: false,
    statistic: "p95",
    budget: null,
  },
  {
    key: "heap.retainedJsBytesPerCycle",
    label: "Retained JS heap per mount cycle",
    unit: "bytes",
    deterministic: false,
    budget: [1.5, 65536],
  },
  {
    key: "heap.liveInstances",
    label: "Live checkboxes after destroy",
    unit: "count",
    deterministic: true,
    budget: [1, 1],
  },
];

// The Origami build bench's metric registry: each key's label, unit, class and budget rule. Times
// are milliseconds, sizes bytes. See bench/README.md for what each metric means and
// tools/bench/README.md for the fields.
export const metrics = [
  {
    key: "bundle.initial.raw",
    label: "Initial: raw",
    unit: "bytes",
    deterministic: true,
    budget: [1.02, 100],
  },
  {
    key: "bundle.initial.gzip",
    label: "Initial: gzip",
    unit: "bytes",
    deterministic: true,
    budget: [1.02, 100],
  },
  {
    key: "bundle.initial.brotli",
    label: "Initial: brotli",
    unit: "bytes",
    deterministic: true,
    budget: [1.02, 100],
  },
  {
    key: "bundle.added.raw",
    label: "Added: raw",
    unit: "bytes",
    deterministic: true,
    budget: [1.02, 100],
  },
  {
    key: "bundle.added.gzip",
    label: "Added: gzip",
    unit: "bytes",
    deterministic: true,
    budget: [1.02, 100],
  },
  {
    key: "bundle.added.brotli",
    label: "Added: brotli",
    unit: "bytes",
    deterministic: true,
    budget: [1.02, 100],
  },
  {
    key: "bundle.origami.raw",
    label: "Origami: raw",
    unit: "bytes",
    deterministic: true,
    budget: [1.02, 100],
  },
  {
    key: "build.ms",
    label: "ng build",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 1000],
  },
  {
    key: "typecheck.ngcMs",
    label: "Type-check: ngc",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 100],
  },
  {
    key: "typecheck.instantiations",
    label: "Type-check: tsc instantiations",
    unit: "count",
    deterministic: true,
    budget: [1.1, 100],
  },
];

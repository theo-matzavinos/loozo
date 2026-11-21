// The Origami edit bench's metric registry: each key's label, unit, class and budget rule. Times are
// milliseconds. See bench/README.md for what each metric means and tools/bench/README.md for the
// fields.
export const metrics = [
  {
    key: "edit.startupMs",
    label: "Dev server startup",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 10],
  },
  {
    key: "edit.servedMs",
    label: "Template edit → served",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 10],
  },
  {
    key: "edit.syncMs",
    label: "Library edit → acceptance:sync",
    unit: "ms",
    deterministic: false,
    budget: [1.3, 1000],
  },
];

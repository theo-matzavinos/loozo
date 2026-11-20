// The router's reading of the shared bundle measurement (tools/bench/bundle.mjs): which files hold
// generated route code, and how many route copies the initial files keep.

// Generated route code: the route table, every children table and every route's destination and
// route copy.
const routeTables =
  /(?:^|\/)generated\/routes\.generated\.ts$|(?:^|\/)(?:destination|route|children)\.generated\.ts$/;
// One route's browser copy.
const routeCopy = /(?:^|\/)route\.generated\.ts$/;

// The shared result with each file's input list replaced by whether it holds route tables, and
// the initial route copies counted.
export function routeBundle(bundle) {
  const files = [];

  for (const file of bundle.files) {
    files.push({
      path: file.path,
      initial: file.initial,
      routeTables: file.inputs.some((input) => routeTables.test(input)),
      raw: file.raw,
      gzip: file.gzip,
      brotli: file.brotli,
    });
  }

  const { inputs, ...initial } = bundle.initial;

  return {
    entry: bundle.entry,
    initial: {
      ...initial,
      routeCopies: inputs.filter((input) => routeCopy.test(input)).length,
      inputs,
    },
    lazy: bundle.lazy,
    files,
  };
}

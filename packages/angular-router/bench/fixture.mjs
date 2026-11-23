// The benchmark's route tree: a repeating block of ten declarations, so a size is any multiple of
// ten. Everything here is a pure function of the size; nothing is random.
//
//   gNNNN/            layout page (RouterOutlet); canMatch, resolve and title from two helper
//                     modules beside it (guard-helper.ts, resolver-helper.ts)
//     static/l0..l6   seven static leaves under a transparent directory; l1 has a title
//     $id/            numberParam, layout page
//       detail/       leaf with the inherited id
//
// static/ keeps the leaves from overlapping $id (/gNNNN/$id would otherwise match /gNNNN/l0).
// gNNNN and gNNNN/$id have children, so both load their children's records lazily from their
// children tables: two per block. The root callbacks keep each block's root copy and helpers in
// the startup bundle, the edge that once split it into a file per block.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const blockSize = 10;
const leaves = 7;

// The route the serve phase edits: g0000/static/l0 has no callbacks of its own, so adding a
// title adds exactly one callbacks spread to its generated record.
export const editedRoute = {
  path: "src/routes/g0000/static/l0/route.ts",
  source: (title) => leafRouteSource(0, { title }),
};

function blockName(block) {
  return `g${String(block).padStart(4, "0")}`;
}

function leafRouteSource(leaf, { title = false, resolve = false } = {}) {
  let steps = "";

  if (title) {
    steps += '.title(() => "Benchmark title")';
  }

  if (resolve) {
    steps += ".resolve({ value: () => 42 })";
  }

  return `import { defineRoute } from "@loozo/angular-router";
import parent from "../../route.js";

export default defineRoute("static/l${leaf}", { parent })${steps};
`;
}

// Every page reads its handle's title, params, search and data and builds a typed link. Its h1
// carries the route id, the marker the runtime phase waits for.
function pageSource({ route, sibling, outlet = false, id = false, resolved = false }) {
  let imports = "RouterLink";
  let template = `<h1 data-bench-page="${route}">{{ route.title() }}</h1><a [routerLink]="link">Sibling</a>`;

  if (outlet) {
    imports += ", RouterOutlet";
  }

  if (id) {
    template += "<p>{{ route.params().id }}</p>";
  }

  if (resolved) {
    template += "<p>{{ route.data().value }}</p>";
  }

  if (outlet) {
    template += "<router-outlet />";
  }

  return `import { Component } from "@angular/core";
import { ${imports} } from "@angular/router";
import { injectRoute } from "./route.generated.js";
import { destination as sibling } from "${sibling}/destination.generated.js";

@Component({
  imports: [${imports}],
  template: \`${template}\`,
})
export default class Page {
  readonly route = injectRoute();
  readonly params = this.route.params;
  readonly search = this.route.search;
  readonly data = this.route.data;
  readonly link = this.route.link({ to: sibling });
}
`;
}

// The shell reads the deepest active route and narrows it to g0000/$id with is(). Its bench links
// are the runtime phase's navigations: cold to the last block's static/l1, an unvisited branch,
// and warm between g0000's static/l0 and static/l1.
function shellSource(lastBlock, { remembered = false } = {}) {
  // The remembered workload's warm links carry a page size, so each warm commit writes it.
  let warmQuery = "";

  if (remembered) {
    warmQuery = ' [queryParams]="{ pageSize: 50 }"';
  }

  return `import { Component, computed } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as selected } from "./routes/g0000/$id/destination.generated.js";

@Component({
  selector: "proof-app",
  imports: [RouterLink, RouterOutlet],
  template: \`<p>{{ id() }} {{ title() }}</p><button (click)="next()">Next</button><a data-bench="cold" routerLink="/${lastBlock}/static/l1">Cold</a><a data-bench="warm-a" routerLink="/g0000/static/l0"${warmQuery}>Warm A</a><a data-bench="warm-b" routerLink="/g0000/static/l1"${warmQuery}>Warm B</a><router-outlet />\`,
})
export default class Shell {
  readonly active = injectActiveRoute();
  readonly title = computed(() => this.active()?.title());
  readonly id = computed(() => {
    const route = this.active();

    if (route?.is(selected)) {
      return route.params().id;
    }

    return undefined;
  });

  next() {
    const route = this.active();

    if (route?.is(selected)) {
      void route.navigate({ params: { id: route.params().id + 1 } });
    }
  }
}
`;
}

// The example's entry with the mark the runtime phase's bootstrap time starts from.
const mainSource = `import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import Shell from "./shell.js";
import { routes } from "../generated/routes.generated.js";

performance.mark("bench:bootstrap");
void bootstrapApplication(Shell, { providers: [provideRouter(routes)] });
`;

// The remembered workload's entry: the same, with session storage for remembered keys.
const rememberedMainSource = `import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import Shell from "./shell.js";
import { provideSearchStorage, routes } from "../generated/routes.generated.js";

performance.mark("bench:bootstrap");
void bootstrapApplication(Shell, {
  providers: [provideRouter(routes), provideSearchStorage("session")],
});
`;

// The remembered workload's block roots own a retained view and a remembered page size; every
// block shares the id, so an entry into another block restores the page size stored on g0000.
const rememberedSearch = `{
  search: {
    view: retained(enumParam(["list", "board"])),
    pageSize: remembered(withFallback(numberParam, 20), "bench.pageSize"),
  },
}`;

// Writes src/routes, src/shell.ts and src/main.ts into a consumer whose copied routes were
// excluded. With `remembered`, the remembered workload's variant (see bench/README.md).
export async function writeFixture(consumer, routes, { remembered = false } = {}) {
  async function write(path, source) {
    const file = join(consumer, path);

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, source);
  }

  const blocks = routes / blockSize;

  for (let block = 0; block < blocks; block++) {
    const name = blockName(block);
    const root = `src/routes/${name}`;

    // Distinct per-block helpers that read distinct globals, so no two fold into one.
    await write(
      `${root}/guard-helper.ts`,
      `export function allowed(): boolean {
  return (globalThis as any)["guard_${name}"] !== false;
}
`,
    );
    await write(
      `${root}/resolver-helper.ts`,
      `export function value(): string {
  return "resolved:${name}" + String((globalThis as any)["resolve_${name}"] ?? "");
}
`,
    );
    let facts = "{}";
    let codecs = "";

    if (remembered) {
      facts = rememberedSearch;
      codecs = ", enumParam, numberParam, remembered, retained, withFallback";
    }

    await write(
      `${root}/route.ts`,
      `import { defineRoute${codecs} } from "@loozo/angular-router";
import { allowed } from "./guard-helper.js";
import { value } from "./resolver-helper.js";

export default defineRoute("${name}", ${facts})
  .canMatch([() => allowed()])
  .resolve({ value: () => value() })
  .title(() => "${name}");
`,
    );
    await write(
      `${root}/page.ts`,
      pageSource({ route: name, sibling: "./static/l1", outlet: true }),
    );

    for (let leaf = 0; leaf < leaves; leaf++) {
      const resolve = block === 0 && leaf === 2;

      await write(
        `${root}/static/l${leaf}/route.ts`,
        leafRouteSource(leaf, { title: leaf === 1, resolve }),
      );
      await write(
        `${root}/static/l${leaf}/page.ts`,
        pageSource({ route: `${name}/static/l${leaf}`, sibling: "../l1", resolved: resolve }),
      );
    }

    await write(
      `${root}/$id/route.ts`,
      `import { defineRoute, numberParam } from "@loozo/angular-router";
import parent from "../route.js";

export default defineRoute("$id", { parent, params: { id: numberParam } });
`,
    );
    await write(
      `${root}/$id/page.ts`,
      pageSource({ route: `${name}/$id`, sibling: "../static/l1", outlet: true, id: true }),
    );
    await write(
      `${root}/$id/detail/route.ts`,
      `import { defineRoute } from "@loozo/angular-router";
import parent from "../route.js";

export default defineRoute("detail", { parent });
`,
    );
    await write(
      `${root}/$id/detail/page.ts`,
      pageSource({ route: `${name}/$id/detail`, sibling: "../../static/l1", id: true }),
    );
  }

  await write("src/shell.ts", shellSource(blockName(blocks - 1), { remembered }));

  if (remembered) {
    await write("src/main.ts", rememberedMainSource);
  } else {
    await write("src/main.ts", mainSource);
  }

  return {
    declarations: routes,
    blocks,
    // Routes with children, each loading them from its children table.
    routeGroups: blocks * 2,
    layouts: blocks * 2,
    leaves: blocks * (leaves + 1),
    titled: blocks * 2,
    resolvers: blocks + 1,
    maxDepth: 3,
    rememberedOwners: remembered ? blocks : 0,
  };
}

// The benchmark's route tree: a repeating group of ten declarations, so a size is any multiple of
// ten. Everything here is a pure function of the size; nothing is random.
//
//   gNNNN/            layout page (RouterOutlet)
//     static/l0..l6   seven static leaves under a transparent directory; l1 has a title
//     $id/            numberParam, layout page
//       detail/       leaf with the inherited id
//
// static/ keeps the leaves from overlapping $id (/gNNNN/$id would otherwise match /gNNNN/l0).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const groupSize = 10;
const leaves = 7;

// The route the serve phase edits: g0000/static/l0 has no callbacks of its own, so adding a
// title adds exactly one callbacks spread to its generated record.
export const editedRoute = {
  path: "src/routes/g0000/static/l0/route.ts",
  source: (title) => leafRouteSource(0, { title }),
};

function groupName(group) {
  return `g${String(group).padStart(4, "0")}`;
}

function leafRouteSource(leaf, { title = false, resolve = false } = {}) {
  let options = "parent";

  if (title) {
    options += ', title: () => "Benchmark title"';
  }

  if (resolve) {
    options += ", resolve: { value: () => 42 }";
  }

  return `import { defineRoute } from "@loozo/angular-router";
import parent from "../../route.js";

export default defineRoute("static/l${leaf}", { ${options} });
`;
}

// Every page reads its handle's title, params, search and data and builds a typed link.
function pageSource({ sibling, outlet = false, id = false, resolved = false }) {
  let imports = "RouterLink";
  let template = '<h1>{{ route.title() }}</h1><a [routerLink]="link">Sibling</a>';

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
import { destination as sibling } from "${sibling}/route.generated.js";

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

// The shell reads the deepest active route and narrows it to g0000/$id with is().
const shellSource = `import { Component, computed } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { injectActiveRoute } from "../generated/destinations.generated.js";
import { destination as selected } from "./routes/g0000/$id/route.generated.js";

@Component({
  selector: "proof-app",
  imports: [RouterOutlet],
  template: \`<p>{{ id() }} {{ title() }}</p><button (click)="next()">Next</button><router-outlet />\`,
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

// Writes src/routes and src/shell.ts into a consumer whose copied routes were excluded.
export async function writeFixture(consumer, routes) {
  async function write(path, source) {
    const file = join(consumer, path);

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, source);
  }

  const groups = routes / groupSize;

  for (let group = 0; group < groups; group++) {
    const name = groupName(group);
    const root = `src/routes/${name}`;

    await write(
      `${root}/route.ts`,
      `import { defineRoute } from "@loozo/angular-router";

export default defineRoute("${name}", {});
`,
    );
    await write(`${root}/page.ts`, pageSource({ sibling: "./static/l1", outlet: true }));

    for (let leaf = 0; leaf < leaves; leaf++) {
      const resolve = group === 0 && leaf === 2;

      await write(
        `${root}/static/l${leaf}/route.ts`,
        leafRouteSource(leaf, { title: leaf === 1, resolve }),
      );
      await write(
        `${root}/static/l${leaf}/page.ts`,
        pageSource({ sibling: "../l1", resolved: resolve }),
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
      pageSource({ sibling: "../static/l1", outlet: true, id: true }),
    );
    await write(
      `${root}/$id/detail/route.ts`,
      `import { defineRoute } from "@loozo/angular-router";
import parent from "../route.js";

export default defineRoute("detail", { parent });
`,
    );
    await write(`${root}/$id/detail/page.ts`, pageSource({ sibling: "../../static/l1", id: true }));
  }

  await write("src/shell.ts", shellSource);

  return {
    declarations: routes,
    groups,
    layouts: groups * 2,
    leaves: groups * (leaves + 1),
    titled: groups,
    resolvers: 1,
    maxDepth: 3,
  };
}

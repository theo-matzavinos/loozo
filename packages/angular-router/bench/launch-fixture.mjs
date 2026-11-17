// The Launch workload's route tree: fixture.mjs's block of ten declarations, declared with
// Launch's defineRoute and given server steps. Everything here is a pure function of the size.
//
//   gNNNN/            layout page; a context stage that refuses a call without a user and
//                     narrows it to a string, .use(timing), and the gNNNN namespace (a query
//                     and a mutation); canMatch, resolve and title from two helper modules
//     static/l0..l6   seven static leaves under a transparent directory; l1 has a title
//     $id/            numberParam, layout page; the gNNNNItem namespace (a query and a
//                     mutation), and a canActivate, resolve and title that call it
//       detail/       leaf with the inherited id
//
// Leaves have no server steps. Every page reads its handle's remote and queries; the shell
// narrows the active route to g0000/$id and calls its remote.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { blockSize } from "./fixture.mjs";

const leaves = 7;

function blockName(block) {
  return `g${String(block).padStart(4, "0")}`;
}

// Middleware and input schemas for every block, server-only: the route copies drop them.
const serverModule = `import { middleware, type Schema } from "@loozo/angular-launch/server";

export const timing = middleware(async ({ next, response }) => {
  const start = performance.now();

  try {
    return await next();
  } finally {
    response.headers.append("server-timing", \`rpc;dur=\${(performance.now() - start).toFixed(1)}\`);
  }
});

export const textSchema: Schema<{ readonly text: string }> = {
  "~standard": {
    version: 1,
    vendor: "bench",
    validate(value) {
      if (typeof value !== "object" || value === null || !("text" in value) || typeof value.text !== "string") {
        return { issues: [{ message: "Text required", path: ["text"] }] };
      }

      return { value: { text: value.text } };
    },
  },
};

export const itemSchema: Schema<{ readonly id: number }> = {
  "~standard": {
    version: 1,
    vendor: "bench",
    validate(value) {
      if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "number") {
        return { issues: [{ message: "Item id required", path: ["id"] }] };
      }

      return { value: { id: value.id } };
    },
  },
};
`;

function leafRouteSource(leaf, { title = false, resolve = false } = {}) {
  let steps = "";

  if (title) {
    steps += '.title(() => "Benchmark title")';
  }

  if (resolve) {
    steps += ".resolve({ value: () => 42 })";
  }

  return `import { defineRoute } from "@loozo/angular-launch";
import parent from "../../route.js";

export default defineRoute("static/l${leaf}", { parent })${steps};
`;
}

// Every page reads its handle's title, params, search and data, builds a typed link, reads the
// block's query through queries and calls its mutation through remote; pages under $id do the
// same with their item's namespace.
function pageSource({ block, sibling, outlet = false, id = false, resolved = false }) {
  let imports = "RouterLink";
  let template =
    '<h1>{{ route.title() }}</h1><a [routerLink]="link">Sibling</a><p>{{ read.data()?.user }}</p><button (click)="write()">Write</button>';
  let members = "";

  if (outlet) {
    imports += ", RouterOutlet";
  }

  if (id) {
    template +=
      '<p>{{ route.params().id }} {{ item.data()?.name }}</p><button (click)="note()">Note</button>';
    members += `
  readonly item = injectQuery(() =>
    this.route.queries.${block}Item.get.queryOptions({ id: this.route.params().id }),
  );

  async note(): Promise<void> {
    await this.route.remote.${block}Item.note({ text: "bench" });
  }
`;
  }

  if (resolved) {
    template += "<p>{{ route.data().value }}</p>";
  }

  if (outlet) {
    template += "<router-outlet />";
  }

  return `import { Component } from "@angular/core";
import { ${imports} } from "@angular/router";
import { injectQuery } from "@tanstack/angular-query";
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
  readonly read = injectQuery(() => this.route.queries.${block}.read.queryOptions());

  async write(): Promise<void> {
    await this.route.remote.${block}.write({ text: "bench" });
  }
${members}}
`;
}

// The shell reads the deepest active route, narrows it to g0000/$id with is() and calls that
// route's remote.
const shellSource = `import { Component, computed } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as selected } from "./routes/g0000/$id/destination.generated.js";

@Component({
  selector: "launch-root",
  imports: [RouterOutlet],
  template: \`<p>{{ id() }} {{ title() }}</p><button (click)="next()">Next</button><button (click)="note()">Note</button><router-outlet />\`,
})
export class App {
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

  async note(): Promise<void> {
    const route = this.active();

    if (route?.is(selected)) {
      await route.remote.g0000Item.note({ text: "bench" });
    }
  }
}
`;

// Writes src/routes, src/bench.server.ts and the shell (src/app.ts) into a Launch consumer whose
// copied routes were excluded.
export async function writeLaunchFixture(consumer, routes) {
  async function write(path, source) {
    const file = join(consumer, path);

    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, source);
  }

  const blocks = routes / blockSize;

  await write("src/bench.server.ts", serverModule);

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
    await write(
      `${root}/route.ts`,
      `import { defineRoute } from "@loozo/angular-launch";
import { forbidden } from "@loozo/angular-launch/server";
import { textSchema, timing } from "../../bench.server.js";
import { allowed } from "./guard-helper.js";
import { value } from "./resolver-helper.js";

export default defineRoute("${name}", {})
  .context(({ request }) => {
    const user = request.headers.get("x-bench-user");

    if (user === null) {
      throw forbidden();
    }

    return { user };
  })
  .use(timing)
  .remote(({ query, mutation }) => ({
    ${name}: {
      read: query({ handler: ({ context }) => ({ user: context.user, block: "${name}" }) }),
      write: mutation({
        input: textSchema,
        handler: ({ input, context }) => ({ user: context.user, text: input.text }),
      }),
    },
  }))
  .canMatch([() => allowed()])
  .resolve({ value: () => value() })
  .title(() => "${name}");
`,
    );
    await write(
      `${root}/page.ts`,
      pageSource({ block: name, sibling: "./static/l1", outlet: true }),
    );

    for (let leaf = 0; leaf < leaves; leaf++) {
      const resolve = block === 0 && leaf === 2;

      await write(
        `${root}/static/l${leaf}/route.ts`,
        leafRouteSource(leaf, { title: leaf === 1, resolve }),
      );
      await write(
        `${root}/static/l${leaf}/page.ts`,
        pageSource({ block: name, sibling: "../l1", resolved: resolve }),
      );
    }

    await write(
      `${root}/$id/route.ts`,
      `import { defineRoute } from "@loozo/angular-launch";
import { numberParam } from "@loozo/angular-router";
import { itemSchema, textSchema } from "../../../bench.server.js";
import parent from "../route.js";

export default defineRoute("$id", { parent, params: { id: numberParam } })
  .remote(({ query, mutation }) => ({
    ${name}Item: {
      get: query({
        input: itemSchema,
        handler: ({ input, context }) => ({ id: input.id, name: \`\${context.user} \${input.id}\` }),
      }),
      note: mutation({
        input: textSchema,
        handler: ({ input, context }) => ({ user: context.user, text: input.text }),
      }),
    },
  }))
  .canActivate([
    async ({ params, remote }) => (await remote.${name}Item.get({ id: params.id })).id === params.id,
  ])
  .resolve({ item: ({ params, remote }) => remote.${name}Item.get({ id: params.id }) })
  .title(async ({ params, remote }) => (await remote.${name}Item.get({ id: params.id })).name);
`,
    );
    await write(
      `${root}/$id/page.ts`,
      pageSource({ block: name, sibling: "../static/l1", outlet: true, id: true }),
    );
    await write(
      `${root}/$id/detail/route.ts`,
      `import { defineRoute } from "@loozo/angular-launch";
import parent from "../route.js";

export default defineRoute("detail", { parent });
`,
    );
    await write(
      `${root}/$id/detail/page.ts`,
      pageSource({ block: name, sibling: "../../static/l1", id: true }),
    );
  }

  await write("src/app.ts", shellSource);

  return {
    declarations: routes,
    blocks,
    // Routes with children, each loading them from its children table.
    routeGroups: blocks * 2,
    layouts: blocks * 2,
    leaves: blocks * (leaves + 1),
    titled: blocks * 3,
    resolvers: blocks * 2 + 1,
    contextStages: blocks,
    middleware: blocks,
    namespaces: blocks * 2,
    procedures: blocks * 4,
    maxDepth: 3,
  };
}

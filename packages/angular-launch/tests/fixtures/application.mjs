// Binds a test application from Launch routes, the way the generated server.generated.ts
// binds one: a root route whose `.context()` stage is `context`, and one child route per
// namespace holding that namespace's `.use()` middleware and `.remote()` procedures.
import "@angular/compiler";
import { defineRoute } from "../../dist/index.js";
import { bindApplication } from "../../dist/server/generated.js";

/**
 * @param {string} id - The application identity.
 * @param {{
 *   context?: (args: { request: Request }) => object | Promise<object>,
 *   namespaces?: Record<string, { use?: object[], build: (builders: object) => object }>,
 *   translateSegments?: true,
 * }} options - The root stage, each namespace's middleware and procedures, and whether the
 * app was generated with translated segments.
 */
export function application(id, { context, namespaces = {}, translateSegments } = {}) {
  let root = defineRoute("", {});
  const routes = [];

  if (context) {
    root = root.context(context);
    routes.push([root, "src/routes/route.ts"]);
  }

  for (const [name, { use = [], build }] of Object.entries(namespaces)) {
    let route = defineRoute(name, { parent: root });

    if (use.length > 0) {
      route = route.use(...use);
    }

    route = route.remote((builders) => ({ [name]: build(builders) }));
    routes.push([route, `src/routes/${name}/route.ts`]);
  }

  return bindApplication(id, routes, translateSegments ? { translateSegments } : undefined);
}

const bindings = new WeakMap();

/**
 * The application for an `{ id, context, translateSegments? }` description and a namespaces map, bound once per
 * pair, so every call with the same pair shares its stages, as one generated app does.
 */
export function bound(description, namespaces) {
  let byNamespaces = bindings.get(description);

  if (!byNamespaces) {
    byNamespaces = new WeakMap();
    bindings.set(description, byNamespaces);
  }

  let app = byNamespaces.get(namespaces);

  if (!app) {
    app = application(description.id, {
      context: description.context,
      namespaces,
      translateSegments: description.translateSegments,
    });
    byNamespaces.set(namespaces, app);
  }

  return app;
}

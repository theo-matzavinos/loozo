import type { Type } from "@angular/core";
import { defineRoute } from "@loozo/angular-router";
import { demos } from "../../../../../generated/content/demos.generated.js";
import { loadPackage } from "../../../../../generated/content/index.generated.js";
import { findGuide, notFoundRedirect } from "../../../../package-content.js";
import { route as packageRoute } from "../../route.generated.js";

/** This route's browser copy: its declaration without server-only steps, read by the generated route configuration. */ const routegen$route = routegen$routeOf(defineRoute, routegen$destination, packageRoute)



  .canActivate([
    async ({ params }, snapshot, state) => {
      const notFound = notFoundRedirect(state.url);
      const content = await loadPackage(params.package);

      if (findGuide(content, params.guide) === undefined) {
        return notFound;
      }

      return true;
    },
  ])
  .resolve({
    // Loaded before the page renders, so prerendering and hydration see the same components.
    demos: async ({ params }) => {
      const content = await loadPackage(params.package);
      const { guide } = findGuide(content, params.guide)!;
      const loading: Promise<[string, Type<unknown>]>[] = [];

      for (const block of guide.blocks) {
        if (block.kind === "demo") {
          loading.push(demos[block.demo]().then((component) => [block.demo, component]));
        }
      }

      return new Map(await Promise.all(loading));
    },
  });
import { routeOf as routegen$routeOf, injectGeneratedRoute as routegen$injectGeneratedRoute, type Handle as routegen$Handle } from "@loozo/angular-router/_generated";
import { destination as routegen$destination } from "./destination.generated.js";
import { destination as routegen$up } from "../../+overview/destination.generated.js";
export { routegen$route as route };
/**
 * Injects a typed handle bound to this exact generated activated route record.
 *
 * @remarks
 * Call in an Angular injection context. The handle exposes readonly native
 * params/search/data/title Signals and destination-typed link/navigate methods.
 * Data holds the resolver results of this route and its ancestors, a nearer
 * key hiding an ancestor's; native static data and the title stay out. Title
 * is the nearest declared title in the chain, or undefined when none declares one.
 * Navigation values are explicit, except omitted retained search keys; links and
 * navigations compose with the current URL, keeping the named-outlet branches a
 * navigation doesn't touch.
 *
 * @returns A noncallable handle for this declaration.
 * @throws A synchronous wiring error outside an injection context or when the
 * activated record does not carry this declaration's own generated identity.
 */
function routegen$injectRoute(): routegen$Handle<typeof routegen$route, typeof routegen$up> { return routegen$injectGeneratedRoute(routegen$route, routegen$up); }
export { routegen$injectRoute as injectRoute };
// @loozo/angular-router routegen: owned route.generated.ts

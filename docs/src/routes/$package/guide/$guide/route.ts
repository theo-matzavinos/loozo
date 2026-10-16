import type { Type } from "@angular/core";
import { defineRoute, stringParam } from "@loozo/angular-router";
import { demos } from "../../../../../generated/content/demos.generated.js";
import { loadPackage } from "../../../../../generated/content/index.generated.js";
import { findGuide, notFoundRedirect } from "../../../../package-content.js";
import packageRoute from "../../route.js";

export default defineRoute("guide/$guide", {
  parent: packageRoute,
  params: { guide: stringParam },
  canActivate: [
    async ({ params }, snapshot, state) => {
      const notFound = notFoundRedirect(state.url);
      const content = await loadPackage(params.package);

      if (findGuide(content, params.guide) === undefined) {
        return notFound;
      }

      return true;
    },
  ],
  resolve: {
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
  },
});

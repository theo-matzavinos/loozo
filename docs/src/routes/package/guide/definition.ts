import { defineRoute, stringParam } from "@loozo/angular-router";
import { loadPackage } from "../../../../generated/content/index.generated.js";
import { notFoundRedirect } from "../../../package-content.js";
import packageRoute from "../definition.js";

export default defineRoute("guide/$guide", {
  parent: packageRoute,
  params: { guide: stringParam },
  canActivate: [
    async ({ params }, snapshot, state) => {
      const notFound = notFoundRedirect(state.url);
      const content = await loadPackage(params.package);

      for (const guide of content.guides) {
        if (guide.slug === params.guide) {
          return true;
        }
      }

      return notFound;
    },
  ],
});

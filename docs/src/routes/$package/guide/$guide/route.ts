import { defineRoute, stringParam } from "@loozo/angular-router";
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
});

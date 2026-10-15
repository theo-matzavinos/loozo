import { defineRoute } from "@loozo/angular-router";
import { loadPackage } from "../../../../generated/content/index.generated.js";
import { notFoundRedirect } from "../../../package-content.js";
import packageRoute from "../route.js";

export default defineRoute("generated-api", {
  parent: packageRoute,
  canActivate: [
    async ({ params }, snapshot, state) => {
      const notFound = notFoundRedirect(state.url);
      const content = await loadPackage(params.package);

      if (content.generatedApi.length > 0) {
        return true;
      }

      return notFound;
    },
  ],
});

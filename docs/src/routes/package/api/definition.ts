import { defineRoute, stringParam } from "@loozo/angular-router";
import { loadPackage } from "../../../../generated/content/index.generated.js";
import { notFoundRedirect } from "../../../package-content.js";
import packageRoute from "../definition.js";

export default defineRoute("api/$symbol", {
  parent: packageRoute,
  params: { symbol: stringParam },
  canActivate: [
    async ({ params }, snapshot, state) => {
      const notFound = notFoundRedirect(state.url);
      const content = await loadPackage(params.package);

      for (const entryPoint of content.entryPoints) {
        for (const symbol of entryPoint.symbols) {
          if (symbol.slug === params.symbol) {
            return true;
          }
        }
      }

      return notFound;
    },
  ],
});

import { defineRoute, enumParam } from "@loozo/angular-router";
import { loadPackage, packageSlugs } from "../../../generated/content/index.generated.js";

// An unknown package doesn't match, so it reaches the root not-found route.
export default defineRoute("$package", {
  params: { package: enumParam(packageSlugs) },
  resolve: { content: ({ params }) => loadPackage(params.package) },
});

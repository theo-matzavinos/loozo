import { enumParam } from "@loozo/angular-router";
import { packageSlugs } from "../../../generated/content/index.generated.js";

// An unknown package doesn't match, so it reaches the root not-found route.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("$package", {
  params: { package: enumParam(packageSlugs) },
}, "src/routes/$package/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts

import { defineRoute, stringParam } from "@loozo/angular-router";
import { resolvePackage } from "../../package-content.js";

// A string, not enumParam(packageSlugs): with a resolver, a value enumParam rejects fails the whole
// navigation, so an unknown package couldn't render the not-found page.
export default defineRoute("$package", {
  params: { package: stringParam },
  resolve: { content: ({ params }) => resolvePackage(params.package) },
});

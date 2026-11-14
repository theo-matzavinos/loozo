// The test extension's factory with an explicit RouteFactory annotation: the second
// declaration form a published extension can emit.
import { createRouteFactory, type RouteFactory } from "@loozo/angular-router/_core";
import { fixtureRuntime, type FixtureSpec } from "./index.js";

export { needsMissing, needsUser, timing, inputProbe } from "./index.js";
// Declaration emit names these when it prints a route's inferred type.
export type * from "./index.js";

export const defineRoute: RouteFactory<FixtureSpec> =
  createRouteFactory<FixtureSpec>(fixtureRuntime);

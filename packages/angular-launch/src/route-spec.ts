// The `@loozo/angular-launch/_route` entry: the route-extension types a route's inferred type
// names, for declaration emit only.
//
// A route made by Launch's `defineRoute` has a type that names `LaunchSpec` and, for each step it
// still offers, `LaunchStep` and that step's `ContextStep`, `UseStep` or `RemoteStep`. An
// application or library that emits declarations for an exported route writes
// `import("@loozo/angular-launch/_route").LaunchSpec` and the like. The path and these five names
// are stable within a major (SPEC §Stability); the types' members aren't. Import nothing from here
// yourself. `route.ts` imports `LaunchSpec` through this file so TypeScript loads the entry
// whenever it loads `defineRoute`.
export type { ContextStep, LaunchSpec, LaunchStep, RemoteStep, UseStep } from "./route-types.js";

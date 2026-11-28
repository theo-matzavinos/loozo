// The `@loozo/angular-launch/_route` entry: the route-extension types a route's inferred type
// names, for declaration emit only.
//
// A route made by Launch's `defineRoute` has a type that names `LaunchSpec` and, for each step it
// still offers, `LaunchStep` and that step's `ContextStep`, `UseStep` or `RemoteStep`. An
// application that emits declarations for an exported route writes
// `import("@loozo/angular-launch/_route").LaunchSpec` and the like, so the names must be reachable
// through an export. Like the router's `_core`, the entry is private: emitted route declarations
// aren't published API (SPEC §Stability "Emitted declarations"). Import nothing from here yourself.
// `route.ts` imports `LaunchSpec` through this file so TypeScript loads the entry whenever it
// loads `defineRoute`.
export type { ContextStep, LaunchSpec, LaunchStep, RemoteStep, UseStep } from "./route-types.js";
// `RemoteStep`'s callback returns a namespace map of `ProcedureDefinition`, which an exported
// helper typed from a route's `.remote` parameter can infer.
export type { ProcedureDefinition } from "./server/definitions.js";

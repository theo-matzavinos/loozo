import { destinationRecord, type Destination } from "./destination.js";
import { angularPath } from "./path.js";
import type { AnyRoute } from "./types.js";

/**
 * The Angular path pattern of a destination, for a server route in `app.routes.server.ts`.
 *
 * @remarks
 * Static segments read the running build's text, so one server route names a translated
 * route in every locale. Scalars become `:name`, a catchall `**`, and the root `""`.
 *
 * @param destination - A genuine destination, imported from its `destination.generated.ts`.
 * @returns The destination's effective Angular path, without a leading "/".
 * @throws TypeError for anything that isn't a genuine destination.
 *
 * @example
 * ```ts
 * { path: serverRoutePath(product), renderMode: RenderMode.Prerender }
 * ```
 */
export function serverRoutePath(destination: Destination<AnyRoute>): string {
  return angularPath(destinationRecord(destination).url.segments);
}

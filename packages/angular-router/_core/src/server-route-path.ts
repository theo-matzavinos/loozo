import { destinationRecord, type Destination } from "./destination.js";
import { angularPath } from "./path.js";
import type { AnyRoute, OutletOf } from "./types.js";

/**
 * The Angular path pattern of a destination, for a server route in `app.routes.server.ts`.
 *
 * @remarks
 * Static segments read the running build's text, so one server route names a translated
 * route in every locale. Scalars become `:name`, a catchall `**`, and the root `""`.
 * A destination in a named outlet has none: Angular matches server routes by pathname,
 * so named-outlet URLs reach the `**` server route.
 *
 * @param destination - A genuine destination, imported from its `destination.generated.ts`,
 * in the primary outlet.
 * @returns The destination's effective Angular path, without a leading "/".
 * @throws TypeError for anything that isn't a genuine destination, or for one in a named outlet.
 *
 * @example
 * ```ts
 * { path: serverRoutePath(product), renderMode: RenderMode.Prerender }
 * ```
 */
export function serverRoutePath<Target extends AnyRoute>(
  destination: Destination<Target> & (OutletOf<Target> extends string ? never : unknown),
): string;

export function serverRoutePath(destination: unknown): string {
  const record = destinationRecord(destination);

  if (record.url.branch) {
    throw new TypeError(
      `serverRoutePath(${record.id}): a destination in outlet ${record.url.branch.outlet} has no server path; named-outlet URLs match the ** server route`,
    );
  }

  return angularPath(record.url.segments);
}

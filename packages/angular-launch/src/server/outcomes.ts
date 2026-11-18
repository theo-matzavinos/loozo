import {
  createUrl,
  destinationRecord,
  type AnyRoute,
  type Destination,
  type SearchOf,
  type UrlValues,
} from "@loozo/angular-router/_core";

// Keyed with Symbol.for so the brand survives the duplicate module copies a native SSR
// bundle may load, and non-enumerable so it never reaches JSON.
const outcomeKey = Symbol.for("@loozo/angular-launch/outcome/v1");

/** What a thrown outcome asks the server to answer with. Internal. */
export type Outcome =
  | { readonly kind: "forbidden" }
  | { readonly kind: "notFound" }
  | {
      readonly kind: "redirect";
      readonly to: `/${string}`;
      // The ordinals of `to`'s path segments that hold the destination's static segments,
      // ascending: a named-outlet destination's anchor segments, then its group's; the outlet
      // label is no segment.
      readonly words: readonly number[];
    };

function outcomeError(message: string, outcome: Outcome): Error {
  const error = new Error(message);

  Object.defineProperty(error, outcomeKey, { value: outcome });

  return error;
}

/**
 * Creates an error that refuses the call with `FORBIDDEN` when thrown from middleware
 * or a handler.
 *
 * @example
 * ```ts
 * if (context.user === null) {
 *   throw forbidden();
 * }
 * ```
 *
 * @returns The error to `throw`.
 */
export function forbidden(): Error {
  return outcomeError("RPC forbidden", { kind: "forbidden" });
}

/**
 * Creates an error that answers the call as not found when thrown from middleware or a
 * handler.
 *
 * @remarks
 * The caller's call rejects with `RpcNotFound` from `@loozo/angular-launch`. In a guard or
 * resolver, `rpcNavigationErrors()` renders the app's not-found page at the requested URL,
 * with status 404 during server rendering. It isn't an error code: use it for a missing
 * resource the page can't show, and a declared error for one the page handles itself.
 *
 * @example
 * ```ts
 * if (chat === null) {
 *   throw notFound();
 * }
 * ```
 *
 * @returns The error to `throw`.
 */
export function notFound(): Error {
  return outcomeError("RPC not found outcome", { kind: "notFound" });
}

/**
 * Creates an error that answers the call with a redirect to an app destination when thrown
 * from middleware or a handler.
 *
 * @remarks
 * The redirect goes to `createUrl(destination, values)`; both arguments are typed exactly as
 * `createUrl`'s, so `values` is required (`{}` for none). The caller's call rejects with
 * `RpcRedirect` from `@loozo/angular-launch`. In a guard or resolver, `rpcNavigationErrors()`
 * navigates to its `to` instead, which during server rendering answers the page request with
 * a 302. Nothing navigates outside navigation. Only declared destinations are targets: a
 * redirect target's search keys must be declared on its route, and an external redirect
 * (OAuth, for example) is data the page acts on.
 *
 * With `translateSegments`, the server still builds the canonical URL and the frame also
 * lists which of its path segments are static words, counted in order across a named outlet's
 * anchor and group, so the page's own build can put them in its language.
 *
 * @example
 * ```ts
 * // signIn: the sign-in route's `destination`, from its destination.generated.ts
 * if (context.user === null) {
 *   throw redirect(signIn, {});
 * }
 *
 * throw redirect(todo, { params: { id: 2 }, fragment: "title" });
 * ```
 *
 * @param destination - A genuine destination imported from a `destination.generated.ts`.
 * @param values - Its params, search and fragment, as `createUrl` takes them.
 * @returns The error to `throw`.
 * @throws TypeError for anything but a genuine destination from this package instance, and
 * for values `createUrl` refuses; a codec's own failure propagates unchanged, as from
 * `createUrl`.
 */
export function redirect<
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<NoInfer<Target>> = never,
>(destination: Destination<Target>, values: UrlValues<NoInfer<Target>, SearchKeys>): Error {
  const record = destinationRecord(destination);
  const to = createUrl(destination, values);
  const params = (values as { readonly params?: Readonly<Record<string, unknown>> }).params;
  const words: number[] = [];
  let position = 0;

  // createUrl writes one path segment per static or scalar segment and one per catchall
  // element, in order: in a named outlet, the anchor's before the group's.
  for (const segment of [...(record.url.branch?.anchor ?? []), ...record.url.segments]) {
    if (segment.kind === "static") {
      words.push(position);
      position += 1;
    } else if (segment.kind === "scalar") {
      position += 1;
    } else {
      position += (params![segment.name] as readonly unknown[]).length;
    }
  }

  return outcomeError("RPC redirect outcome", { kind: "redirect", to, words });
}

/**
 * Reads the outcome a thrown value carries, if it was created by an outcome factory.
 * Internal.
 *
 * @param error - The thrown value.
 * @returns The outcome, or `undefined` for any other value.
 */
export function outcomeOf(error: unknown): Outcome | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(error, outcomeKey);

  return descriptor?.value as Outcome | undefined;
}

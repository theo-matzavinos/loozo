import { isArrayCodec, type ParamCodec } from "./codecs.js";
import type { Segment } from "./path.js";
import { ownRecord, checkKeys, has } from "./records.js";
import { findRoute } from "./route.js";
import {
  destinationRecord,
  findDestination,
  type Destination,
  type UrlMetadata,
} from "./destination.js";
import type { AnyRoute, SearchOf, UrlValues } from "./types.js";

function encode(value: string): string {
  return encodeURIComponent(value).replaceAll("(", "%28").replaceAll(")", "%29");
}

function stringify(codec: ParamCodec<any>, value: unknown, path: boolean): string {
  const text = codec.stringify(value);

  if (typeof text !== "string") {
    throw new TypeError("Codec stringify must return a string");
  }

  if (path && (text === "" || text === "." || text === "..")) {
    throw new TypeError("Path output cannot be empty, dot or dotdot");
  }

  return encode(text);
}

/**
 * A destination's root-relative path from its encoded segment texts:
 * `/<anchor>/(<outlet>:<group>)` in a named outlet (`/(<outlet>:<group>)` at the root),
 * otherwise `/<group>`. Both URL serializers, `createUrl` and generated redirects, end here.
 *
 * @param name - The destination's id, or its route's path, for the error.
 * @throws TypeError for a named-outlet destination whose group serializes to no segment.
 *
 * @internal
 */
export function branchPath(
  branch: UrlMetadata["branch"],
  anchor: readonly string[],
  group: readonly string[],
  name: string,
): `/${string}` {
  if (!branch) {
    return `/${group.join("/")}`;
  }

  if (group.length === 0) {
    throw new TypeError(
      `A destination in outlet ${branch.outlet} needs at least one path segment: ${name}`,
    );
  }

  const outlet = `(${branch.outlet}:${group.join("/")})`;

  if (anchor.length === 0) {
    return `/${outlet}`;
  }

  return `/${anchor.join("/")}/${outlet}`;
}

// A destination and a route carry the same URL fields.
function urlOf(target: unknown): { url: Omit<UrlMetadata, "parent">; name: string } {
  const destination = findDestination(target);

  if (destination) {
    return { url: destination.url, name: destination.id };
  }

  const route = findRoute(target);

  if (route) {
    let name = JSON.stringify((target as { path: string }).path);

    if (route.destination) {
      name = destinationRecord(route.destination).id;
    }

    return { url: route, name };
  }

  throw new TypeError("Expected a genuine route or destination from this package instance");
}

/**
 * Synchronously serializes a destination's or route's explicit values into a root-relative URL.
 *
 * @remarks
 * Includes inherited path/search declarations, but only this route's fragment
 * names. Every effective path value must be supplied; any search key may be
 * omitted. Searchless/paramless routes forbid those records. Catchalls and
 * `arrayParam` search keys require readonly arrays, including a valid empty array.
 * Values are never taken from a current navigation.
 *
 * A destination in a named outlet takes params only and creates its branch below its
 * anchor's primary path, `/products/(detail:item/3)`, or `/(chat:chat/7)` at the root,
 * with no other branch: it's the exact URL, not a composition with the current one. Its
 * group needs at least one segment, so an empty array for a catchall-only branch root throws.
 *
 * Stringifies without calling parsers, guards, resolvers or redirects. Static
 * segments and logical values are component-encoded (also escaping parentheses),
 * so a dynamic slash becomes `%2F`. Search keys are globally sorted; omitted
 * and `undefined` values are left out. An `arrayParam` key writes one pair per
 * element in array order, and nothing for `[]`. An empty effective path produces `/`.
 * Redirect declarations serialize their source URL, not their redirect target.
 *
 * @param target - A genuine destination imported from a `destination.generated.ts`,
 * or a genuine route, from this physical package instance; not a spread/copy or
 * structural lookalike. A route copy and its destination create the same URL.
 * @param values - Explicit destination-typed params, search and optional fragment.
 * Pass an empty object when the route needs no values.
 * @returns A root-relative URL string, typed `` `/${string}` ``; this does not navigate or
 * return a UrlTree.
 * @throws TypeError for nongenuine targets, invalid records, missing or unknown keys,
 * undeclared fragments, nonarray catchalls or array search values, nonstring codec output, empty/dot
 * path output, search or fragment for a named-outlet destination, or its empty outlet group.
 * Application stringifier failures propagate unchanged.
 * @throws URIError for ill-formed Unicode in a serialized value.
 *
 * @example
 * ```ts
 * import { destination as product } from "./routes/products/$productId/destination.generated.js";
 *
 * createUrl(product, { params: { productId: 42 }, fragment: "summary" });
 * // /products/42#summary
 * ```
 */
export function createUrl<
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<NoInfer<Target>> = never,
>(
  target: Target | Destination<Target>,
  values: UrlValues<NoInfer<Target>, SearchKeys>,
): `/${string}`;

export function createUrl(target: unknown, values: unknown): `/${string}` {
  const { url: metadata, name } = urlOf(target);

  return serializeUrl(metadata, name, values);
}

/**
 * `url`, which `createUrl` made for `target`, with `extra`'s search values added, each
 * stringified as `createUrl` does and placed where `createUrl` would put it, so the caller's
 * values are neither read nor stringified again.
 *
 * @param extra - Values for search keys `url` omits, of the types their codecs parse to; an
 * array key's value is an array.
 *
 * @internal
 */
export function withSearch(
  target: unknown,
  url: `/${string}`,
  extra: Readonly<Record<string, unknown>>,
): `/${string}` {
  const { url: metadata } = urlOf(target);
  // Path, query and fragment text are encoded, so `?` and `#` only ever delimit them.
  const hash = url.indexOf("#");
  const fragment = hash === -1 ? "" : url.slice(hash);
  const rest = hash === -1 ? url : url.slice(0, hash);
  const mark = rest.indexOf("?");
  const path = mark === -1 ? rest : rest.slice(0, mark);
  const parts = mark === -1 ? [] : rest.slice(mark + 1).split("&");
  const query: string[] = [];

  for (const key of Object.keys(metadata.search).sort()) {
    const name = encode(key);

    if (!Object.hasOwn(extra, key)) {
      // An encoded key holds no `=`, so the prefix matches this key's parts only.
      query.push(...parts.filter((part) => part.startsWith(`${name}=`)));

      continue;
    }

    const codec = metadata.search[key];
    const value = extra[key];

    for (const element of isArrayCodec(codec) ? (value as readonly unknown[]) : [value]) {
      query.push(`${name}=${stringify(codec, element, false)}`);
    }
  }

  let result = path;

  if (query.length > 0) {
    result = `${result}?${query.join("&")}`;
  }

  return `${result}${fragment}` as `/${string}`;
}

/**
 * `createUrl` over URL facts: checks `values` against `metadata` and serializes them, with
 * every rule, message and encoding `createUrl` documents. `localeUrls` serializes a locale's
 * copy of a destination's facts with it.
 *
 * @param name - The destination's id, or its route's path, for errors.
 *
 * @internal
 */
export function serializeUrl(
  metadata: Omit<UrlMetadata, "parent">,
  name: string,
  values: unknown,
): `/${string}` {
  const options = ownRecord(values, "URL options");

  checkKeys(options, new Set(["params", "search", "fragment"]), "URL options");

  if (metadata.branch && (has(options, "search") || has(options, "fragment"))) {
    throw new TypeError(`A destination in outlet ${metadata.branch.outlet} takes params only`);
  }

  const paramKeys = Object.keys(metadata.params);
  let params: Record<string, unknown> = Object.create(null);

  if (paramKeys.length === 0) {
    if (has(options, "params")) {
      throw new TypeError("Route has no path params");
    }
  } else {
    params = ownRecord(options.params, "Path values");
    checkKeys(params, new Set(paramKeys), "path values");

    for (const key of paramKeys) {
      if (!has(params, key)) {
        throw new TypeError(`Missing path value: ${key}`);
      }
    }
  }

  const searchKeys = Object.keys(metadata.search).sort();
  let search: Record<string, unknown> = Object.create(null);

  if (searchKeys.length === 0) {
    if (has(options, "search")) {
      throw new TypeError("Route has no search declarations");
    }
  } else {
    if (has(options, "search")) {
      search = ownRecord(options.search, "Search values");
    }

    checkKeys(search, new Set(searchKeys), "search values");
  }

  if (has(options, "fragment")) {
    if (typeof options.fragment !== "string" || !metadata.fragments.includes(options.fragment)) {
      throw new TypeError("Fragment must belong to this declaration");
    }
  }

  // Check all cardinalities before invoking application stringifiers. An anchor holds no catchall.
  for (const segment of metadata.segments) {
    if (segment.kind === "catchall" && !Array.isArray(params[segment.name])) {
      throw new TypeError(`Catchall requires an array: ${segment.name}`);
    }
  }

  for (const key of searchKeys) {
    if (!isArrayCodec(metadata.search[key]) || !has(search, key)) {
      continue;
    }

    const value = search[key];

    if (value !== undefined && !Array.isArray(value)) {
      throw new TypeError(`Search array requires an array: ${key}`);
    }
  }

  function serialize(segments: readonly Segment[]): string[] {
    const parts: string[] = [];

    for (const segment of segments) {
      if (segment.kind === "static") {
        parts.push(encode(segment.text));
      } else if (segment.kind === "scalar") {
        parts.push(stringify(metadata.params[segment.name], params[segment.name], true));
      } else {
        for (const value of params[segment.name] as readonly unknown[]) {
          parts.push(stringify(metadata.params[segment.name], value, true));
        }
      }
    }

    return parts;
  }

  const anchor = serialize(metadata.branch?.anchor ?? []);
  let url = branchPath(metadata.branch, anchor, serialize(metadata.segments), name);
  const query: string[] = [];

  for (const key of searchKeys) {
    const value = search[key];

    if (!has(search, key) || value === undefined) {
      continue;
    }

    if (!isArrayCodec(metadata.search[key])) {
      query.push(`${encode(key)}=${stringify(metadata.search[key], value, false)}`);

      continue;
    }

    for (const element of value as readonly unknown[]) {
      query.push(`${encode(key)}=${stringify(metadata.search[key], element, false)}`);
    }
  }

  if (query.length > 0) {
    url = `${url}?${query.join("&")}`;
  }

  if (has(options, "fragment")) {
    url = `${url}#${encode(options.fragment as string)}`;
  }

  return url;
}

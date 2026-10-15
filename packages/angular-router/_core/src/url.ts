import type { ParamCodec } from "./codecs.js";
import { ownRecord, checkKeys, has } from "./records.js";
import { routeMetadata } from "./route.js";
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
 * Synchronously serializes a route's explicit values into a root-relative URL.
 *
 * @remarks
 * Includes inherited path/search declarations, but only this route's fragment
 * names. Every effective path value must be supplied; any search key may be
 * omitted. Searchless/paramless routes forbid those records. Catchalls require readonly arrays, including a valid empty array.
 * Values are never taken from a current navigation.
 *
 * Stringifies without calling parsers, guards, resolvers or redirects. Static
 * segments and logical values are component-encoded (also escaping parentheses),
 * so a dynamic slash becomes `%2F`. Search keys are globally sorted; omitted
 * and `undefined` values are left out. An empty effective path produces `/`.
 * Redirect declarations serialize their source URL, not their redirect target.
 *
 * @param route - A genuine declaration from this physical package instance,
 * not a generated destination, spread/copy or structural lookalike.
 * @param values - Explicit destination-typed params, search and optional fragment.
 * Pass an empty object when the route needs no values.
 * @returns A root-relative URL string; this does not navigate or return a UrlTree.
 * @throws TypeError for invalid routes/records, missing or unknown keys,
 * undeclared fragments, nonarray catchalls, nonstring codec output, or empty/dot
 * path output. Application stringifier failures propagate unchanged.
 * @throws URIError for ill-formed Unicode in a serialized value.
 *
 * @example
 * ```ts
 * const product = defineRoute("products/$productId", {
 *   params: { productId: numberParam },
 *   fragments: ["summary"],
 * });
 * createUrl(product, { params: { productId: 42 }, fragment: "summary" });
 * // /products/42#summary
 * ```
 */
export function createUrl<
  Target extends AnyRoute,
  SearchKeys extends keyof SearchOf<NoInfer<Target>> = never,
>(route: Target, values: UrlValues<NoInfer<Target>, SearchKeys>): string;

export function createUrl(route: unknown, values: unknown): string {
  const metadata = routeMetadata(route);
  const options = ownRecord(values, "URL options");

  checkKeys(options, new Set(["params", "search", "fragment"]), "URL options");

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

  // Check all cardinalities before invoking application stringifiers.
  for (const segment of metadata.segments) {
    if (segment.kind === "catchall" && !Array.isArray(params[segment.name])) {
      throw new TypeError(`Catchall requires an array: ${segment.name}`);
    }
  }

  const parts: string[] = [];

  for (const segment of metadata.segments) {
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

  let url = `/${parts.join("/")}`;
  const query: string[] = [];

  for (const key of searchKeys) {
    const value = search[key];

    if (!has(search, key) || value === undefined) {
      continue;
    }

    query.push(`${encode(key)}=${stringify(metadata.search[key], value, false)}`);
  }

  if (query.length > 0) {
    url += `?${query.join("&")}`;
  }

  if (has(options, "fragment")) {
    url += `#${encode(options.fragment as string)}`;
  }

  return url;
}

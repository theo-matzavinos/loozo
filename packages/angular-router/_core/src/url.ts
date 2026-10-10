import { codecPresence, type ParamCodec } from "./codecs.js";
import { ownRecord, checkKeys, has } from "./records.js";
import { routeMetadata, validateSearchValues } from "./route.js";
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

    validateSearchValues(metadata.search, search);
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
    const codec = metadata.search[key];
    const optional = codecPresence(codec) === "optional";

    if (optional && !has(search, key)) {
      continue;
    }

    const value = search[key];

    if (optional && value === undefined) {
      continue;
    }

    query.push(`${encode(key)}=${stringify(codec, value, false)}`);
  }

  if (query.length > 0) {
    url += `?${query.join("&")}`;
  }

  if (has(options, "fragment")) {
    url += `#${encode(options.fragment as string)}`;
  }

  return url;
}

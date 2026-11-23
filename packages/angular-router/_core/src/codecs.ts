/**
 * Converts one decoded path or search value to and from an application value.
 *
 * @remarks
 * Both methods are synchronous, and parsing should be pure and deterministic:
 * like Angular's matching callbacks, it runs once while matching and again for
 * the activated route. Neither method performs URL encoding. Codecs have no
 * Angular injection context, and their returned objects are not recursively frozen.
 * For a terminal `$name[]` path or an `arrayParam` search key, this codec applies
 * to each element separately.
 *
 * @typeParam Value - The logical value, never a promise of that value.
 *
 * @example
 * ```ts
 * const dateParam: ParamCodec<Date> = {
 *   parse: (raw) => new Date(raw),
 *   stringify: (value) => value.toISOString(),
 * };
 * ```
 */
export interface ParamCodec<Value> {
  /**
   * Parses one already percent-decoded value; do not decode it again.
   *
   * @param raw - A single logical string from Angular's URL inputs.
   * @returns The logical value, synchronously. Returning a promise or other
   * thenable is a programming error that fails the navigation with a TypeError.
   * @throws An application error for invalid input: an invalid path value makes
   * the route not match, and an invalid search value reads as absent or as its fallback
   * (an `arrayParam` key reads an empty array).
   */
  parse(raw: string): Value;
  /**
   * Serializes one logical value without percent-encoding it.
   *
   * @param value - The application value to serialize.
   * @returns An unencoded string. Path output must not be empty, `.` or `..`.
   * @throws An application error when the value cannot be serialized.
   */
  stringify(value: Value): string;
}

declare const searchFallback: unique symbol;
declare const searchArray: unique symbol;
declare const searchRetained: unique symbol;
declare const searchRemembered: unique symbol;

/**
 * A search-only codec whose key reads a fallback value when it is missing,
 * repeated or invalid, while URL creation may still omit it.
 */
export type FallbackCodec<Value> = ParamCodec<Value> & {
  readonly [searchFallback]: true;
};
/**
 * A search-only codec whose key reads every repeated value, in URL order, as a
 * readonly array; its parse and stringify handle one value each.
 */
export type ArrayCodec<Value> = ParamCodec<Value> & {
  readonly [searchArray]: true;
};
/** The search brands a codec carries. */
type SearchBrand = typeof searchFallback | typeof searchArray | typeof searchRetained;
/**
 * A wrapper of `Codec`: a codec of its value type with its search brands, and none of its
 * other members, which a wrapper doesn't copy.
 */
type CodecWrapper<Codec> = ParamCodec<CodecValue<Codec>> &
  Pick<Codec, Extract<keyof Codec, SearchBrand>>;
/**
 * A search-only codec whose key `link` and `navigate` carry over from the current URL when
 * the caller omits it; reads and URL creation are the wrapped codec's.
 */
export type RetainedCodec<Codec> = CodecWrapper<Codec> & {
  readonly [searchRetained]: true;
};
/**
 * A search-only codec whose key's last committed value is stored under an id and written
 * back into the URL when a navigation enters the key's owner without it; reads and URL
 * creation are the wrapped codec's.
 */
export type RememberedCodec<Codec> = Codec & {
  readonly [searchRemembered]: true;
};
/** A codec `retained` may wrap: one that isn't retained already. */
type UnretainedCodec = { readonly [searchRetained]?: never };
/** A codec `remembered` may wrap: one that isn't remembered already. */
type UnrememberedCodec = { readonly [searchRemembered]?: never };
/** Codecs that may only wrap a plain codec: not a fallback, array, retained or remembered codec. */
type PlainCodec = UnretainedCodec &
  UnrememberedCodec & {
    readonly [searchFallback]?: never;
    readonly [searchArray]?: never;
  };
export type PathCodec = ParamCodec<any> & PlainCodec;
export type CodecValue<Codec> = Codec extends ParamCodec<infer Value> ? Value : never;
export type HasFallback<Codec> = Codec extends { readonly [searchFallback]: true } ? true : false;
export type IsArray<Codec> = Codec extends { readonly [searchArray]: true } ? true : false;

/** Type-only marker: a codec whose parse returns a promise fails where it is declared. */
export interface SynchronousParse {
  /** Never present: `parse` must return its value synchronously, not a Promise. */
  readonly "ParamCodec.parse must return its value synchronously, not a Promise": never;
}
type ParseResult<Codec> = Codec extends { parse(raw: string): infer Result } ? Result : never;
export type SyncValue<Value> =
  Extract<Value, PromiseLike<unknown>> extends never ? unknown : SynchronousParse;
export type SyncCodecs<Codecs> = {
  [Key in keyof Codecs]: SyncValue<ParseResult<Codecs[Key]>>;
};

const fallbacks = new WeakMap<object, { readonly value: unknown }>();

const arrays = new WeakSet<object>();

const retainedCodecs = new WeakSet<object>();

const rememberedIds = new WeakMap<object, string>();

// Letters, digits, ".", "_" and "-": a valid cookie name and storage key without encoding.
const storageIdPattern = /^[A-Za-z0-9._-]+$/;

export function codecFallback(codec: object): { readonly value: unknown } | undefined {
  return fallbacks.get(codec);
}

export function isArrayCodec(codec: object): boolean {
  return arrays.has(codec);
}

export function isRetained(codec: object): boolean {
  return retainedCodecs.has(codec);
}

/** The storage id a `remembered` codec was marked with, or undefined. */
export function rememberedId(codec: object): string | undefined {
  return rememberedIds.get(codec);
}

export function validateCodec(codec: unknown): asserts codec is ParamCodec<any> {
  if (
    codec === null ||
    (typeof codec !== "object" && typeof codec !== "function") ||
    typeof (codec as ParamCodec<unknown>).parse !== "function" ||
    typeof (codec as ParamCodec<unknown>).stringify !== "function"
  ) {
    throw new TypeError("Codec must have callable parse and stringify methods");
  }
}

/**
 * Preserves strings verbatim, including empty strings and literal percent text.
 *
 * @remarks
 * Empty, dot and dotdot values are valid codec values but cannot be serialized
 * into path segments by URL creation. Search values may contain them.
 */
export const stringParam: ParamCodec<string> = {
  parse(raw) {
    return raw;
  },
  stringify(value) {
    if (typeof value !== "string") {
      throw new TypeError("Expected a string");
    }

    return value;
  },
};

/**
 * Parses nonblank text with JavaScript `Number` and requires a finite result.
 *
 * @remarks
 * Whitespace around numbers, exponent notation and hexadecimal text are accepted.
 * Blank text, NaN and infinities throw. Stringification requires a finite number
 * and uses its JavaScript string representation (including `-0` becoming `"0"`).
 */
export const numberParam: ParamCodec<number> = {
  parse(raw) {
    const value = Number(raw);

    if (raw.trim() === "" || !Number.isFinite(value)) {
      throw new Error("Expected a finite number");
    }

    return value;
  },
  stringify(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Expected a finite number");
    }

    return String(value);
  },
};

/**
 * Parses only lowercase `"true"` and `"false"`, and emits those same strings.
 * Other representations and nonboolean values throw.
 */
export const booleanParam: ParamCodec<boolean> = {
  parse(raw) {
    if (raw === "true") {
      return true;
    }

    if (raw === "false") {
      return false;
    }

    throw new Error("Expected true or false");
  },
  stringify(value) {
    if (value === true) {
      return "true";
    }

    if (value === false) {
      return "false";
    }

    throw new Error("Expected a boolean");
  },
};

/**
 * Creates a case-sensitive string codec from a snapshotted list of members.
 *
 * @typeParam Values - The literal list from which the value union is inferred.
 * @param values - Allowed decoded strings; an empty string is valid when listed.
 * @returns A codec whose parser and stringifier reject nonmembers.
 * @throws TypeError if the list or its entries are malformed.
 *
 * @example
 * ```ts
 * const tab = enumParam(["details", "reviews"]);
 * tab.parse("reviews"); // "reviews"
 * ```
 */
export function enumParam<const Values extends readonly string[]>(
  values: Values,
): ParamCodec<Values[number]> {
  if (!Array.isArray(values)) {
    throw new TypeError("Enum values must be a string list");
  }

  const members = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      throw new TypeError("Enum values must be strings");
    }

    members.add(value);
  }

  return {
    parse(raw) {
      if (!members.has(raw)) {
        throw new Error("Unknown enum value");
      }

      return raw as Values[number];
    },
    stringify(value) {
      if (!members.has(value)) {
        throw new Error("Unknown enum value");
      }

      return value;
    },
  };
}

/**
 * Gives a search key a value read in place of a missing, repeated or invalid one.
 *
 * @remarks
 * Every search key is optional: a plain codec's key reads as absent when its
 * value is missing, repeated or invalid. With a fallback, the key always reads a
 * value of the codec's type, while URL creation, links, navigation and redirect
 * replacements may still omit it. The fallback is returned as is: it is neither
 * parsed nor copied. Present values delegate to the wrapped codec unchanged.
 * Fallback codecs are search-only: a path param can't use one, and neither
 * `withFallback` nor `arrayParam` can wrap one. Wrap the result in `retained` or
 * `remembered` to retain or remember the key, never the other way around.
 *
 * @example
 * ```ts
 * search: { page: withFallback(numberParam, 1) }
 * // ?page=abc, ?page=1&page=2 and no page all read as 1.
 * ```
 *
 * @typeParam Value - The wrapped codec's logical value.
 * @param codec - The codec used for present search values.
 * @param fallback - The value read when the key is missing, repeated or invalid.
 * @returns A search-only codec that reads the fallback in place of an absent value.
 * @throws TypeError if the codec lacks callable parse/stringify methods, already
 * has a fallback, or is an `arrayParam` or retained codec.
 */
export function withFallback<Value>(
  codec: ParamCodec<Value> & SyncValue<NoInfer<Value>> & PlainCodec,
  fallback: NoInfer<Value>,
): FallbackCodec<Value> {
  validateCodec(codec);

  if (codecFallback(codec)) {
    throw new TypeError("withFallback cannot wrap a codec that already has a fallback");
  }

  if (arrays.has(codec)) {
    throw new TypeError("withFallback cannot wrap an arrayParam codec");
  }

  if (retainedCodecs.has(codec)) {
    throw new TypeError("withFallback cannot wrap a retained codec");
  }

  if (rememberedIds.has(codec)) {
    throw new TypeError("withFallback cannot wrap a remembered codec");
  }

  const wrapper: ParamCodec<Value> = {
    parse(raw) {
      return codec.parse(raw);
    },
    stringify(value) {
      return codec.stringify(value);
    },
  };

  fallbacks.set(wrapper, Object.freeze({ value: fallback }));

  return wrapper as FallbackCodec<Value>;
}

/**
 * Reads every value of a repeated search key (`?tag=a&tag=b`) as a readonly array.
 *
 * @remarks
 * The key always reads an array, never `undefined`: each value parses with the
 * wrapped codec, in URL order and keeping duplicates. A missing key reads `[]`, and
 * so does a key with any invalid value: one invalid value empties the whole list.
 * URL creation, links, navigation and redirect replacements write one `key=value`
 * pair per element in array order; `[]` and `undefined` leave the key out, so an
 * empty list and a missing key share one URL. Array codecs are search-only (a path
 * uses a terminal `$name[]` instead) and take no fallback: `withFallback` can't wrap
 * one, and `arrayParam` can't wrap a fallback, a retained, a remembered or another array codec.
 *
 * @example
 * ```ts
 * search: { tag: arrayParam(enumParam(["news", "guides"])) }
 * // ?tag=news&tag=guides reads ["news", "guides"]; no tag and ?tag=other read [].
 * ```
 *
 * @typeParam Value - The wrapped codec's logical value.
 * @param codec - The codec for each value.
 * @returns A search-only codec whose key reads `readonly Value[]`.
 * @throws TypeError if the codec lacks callable parse/stringify methods, has a
 * fallback, is retained or remembered, or is already an array codec.
 */
export function arrayParam<Value>(
  codec: ParamCodec<Value> & SyncValue<NoInfer<Value>> & PlainCodec,
): ArrayCodec<Value> {
  validateCodec(codec);

  if (codecFallback(codec)) {
    throw new TypeError("arrayParam cannot wrap a codec that has a fallback");
  }

  if (arrays.has(codec)) {
    throw new TypeError("arrayParam cannot wrap another arrayParam codec");
  }

  if (retainedCodecs.has(codec)) {
    throw new TypeError("arrayParam cannot wrap a retained codec");
  }

  if (rememberedIds.has(codec)) {
    throw new TypeError("arrayParam cannot wrap a remembered codec");
  }

  const wrapper: ParamCodec<Value> = {
    parse(raw) {
      return codec.parse(raw);
    },
    stringify(value) {
      return codec.stringify(value);
    },
  };

  arrays.add(wrapper);

  return wrapper as ArrayCodec<Value>;
}

/**
 * Marks a search key as retained: `link` and `navigate` carry its current value into every
 * destination that inherits the key when the caller omits it.
 *
 * @remarks
 * Wrap the codec of a key a declaration owns. When a handle's `link` or `navigate` targets a
 * destination that inherits the key, the current URL is inside the key's owner and the
 * caller's `search` record has no own entry for it, the current URL's value is copied: a
 * present valid value, parsed with this codec, never a fallback. An explicit `undefined`
 * drops the key. Which handle calls doesn't matter. `createUrl`, `localeUrls` and redirects
 * never retain. Reads, fallbacks, arrays and URL creation are the wrapped codec's.
 * Retained codecs are search-only and outermost, in either order with `remembered`: a path
 * param can't use one, and neither `withFallback` nor `arrayParam` can wrap one.
 *
 * @example
 * ```ts
 * search: { workspace: retained(stringParam), page: retained(withFallback(numberParam, 1)) }
 * // On /orders?workspace=acme, route.link({ to: order, params: { id: 7 } }) is
 * // /orders/7?workspace=acme; search: { workspace: undefined } drops it.
 * ```
 *
 * @typeParam Codec - The wrapped codec, with its fallback, array or remembered behavior.
 * @param codec - The key's codec.
 * @returns A search-only codec that reads and writes like `codec` and retains the key.
 * @throws TypeError if the codec lacks callable parse/stringify methods or is already retained.
 */
export function retained<Codec extends ParamCodec<any>>(
  codec: Codec & UnretainedCodec,
): RetainedCodec<Codec> {
  validateCodec(codec);

  if (retainedCodecs.has(codec)) {
    throw new TypeError("retained cannot wrap a codec that is already retained");
  }

  const wrapper: ParamCodec<unknown> = {
    parse(raw) {
      return codec.parse(raw);
    },
    stringify(value) {
      return codec.stringify(value);
    },
  };

  inherit(codec, wrapper);
  retainedCodecs.add(wrapper);

  return wrapper as RetainedCodec<Codec>;
}

/**
 * Marks a search key as remembered: its last committed value is stored under `id`, and a
 * navigation that enters the key's owner without it is redirected to the same URL with the
 * stored value.
 *
 * @remarks
 * Wrap the codec of a key a declaration owns, and install `provideSearchStorage()` from
 * `routes.generated.ts`. Every commit while the owner is active stores the URL's present
 * valid value, or forgets it when the key is absent, invalid or equal to its fallback. A
 * navigation entering the owner from outside it, first load included, that lacks the key is
 * redirected to its URL plus the stored value after every guard accepted the original URL and
 * before any resolver or title runs. Inside the owner, a missing key means cleared. The id
 * names the stored value: the same id is the same value wherever it's used, and a new id
 * (`"orders.pageSize.v2"`) starts afresh. Two keys of one route and its ancestors can't share
 * an id. Reads, fallbacks, arrays, retention and URL creation are the wrapped codec's.
 * Remembered codecs are search-only and outermost, in either order with `retained`: a path
 * param can't use one, and neither `withFallback` nor `arrayParam` can wrap one.
 *
 * @example
 * ```ts
 * search: { pageSize: remembered(withFallback(numberParam, 20), "orders.pageSize") }
 * // After /orders?pageSize=50 commits, entering /orders from elsewhere opens /orders?pageSize=50.
 * ```
 *
 * @typeParam Codec - The wrapped codec, with its fallback, array or retained behavior.
 * @param codec - The key's codec.
 * @param id - The storage id: letters, digits, `.`, `_` and `-`, so it's a valid cookie name
 * and storage key as is.
 * @returns A search-only codec that reads and writes like `codec` and remembers the key.
 * @throws TypeError if the codec lacks callable parse/stringify methods or is already
 * remembered, or the id is empty or has other characters.
 */
export function remembered<Codec extends ParamCodec<any>>(
  codec: Codec & UnrememberedCodec,
  id: string,
): RememberedCodec<Codec> {
  validateCodec(codec);

  if (rememberedIds.has(codec)) {
    throw new TypeError("remembered cannot wrap a codec that is already remembered");
  }

  if (typeof id !== "string" || !storageIdPattern.test(id)) {
    throw new TypeError(
      `Remembered search id must match /^[A-Za-z0-9._-]+$/: ${JSON.stringify(id)}`,
    );
  }

  const wrapper: ParamCodec<unknown> = {
    parse(raw) {
      return codec.parse(raw);
    },
    stringify(value) {
      return codec.stringify(value);
    },
  };

  inherit(codec, wrapper);
  rememberedIds.set(wrapper, id);

  return wrapper as RememberedCodec<Codec>;
}

// A marking wrapper answers for the codec it wraps: the same fallback, array reads and marks.
function inherit(codec: object, wrapper: object): void {
  const fallback = fallbacks.get(codec);

  if (fallback) {
    fallbacks.set(wrapper, fallback);
  }

  if (arrays.has(codec)) {
    arrays.add(wrapper);
  }

  if (retainedCodecs.has(codec)) {
    retainedCodecs.add(wrapper);
  }

  const id = rememberedIds.get(codec);

  if (id !== undefined) {
    rememberedIds.set(wrapper, id);
  }
}

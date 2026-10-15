/**
 * Converts one decoded path or search value to and from an application value.
 *
 * @remarks
 * Both methods are synchronous, and parsing should be pure and deterministic:
 * like Angular's matching callbacks, it runs once while matching and again for
 * the activated route. Neither method performs URL encoding. Codecs have no
 * Angular injection context, and their returned objects are not recursively frozen.
 * For a terminal `$name[]` path, this codec applies to each element separately.
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
   * the route not match, and an invalid search value reads as absent or as its fallback.
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

/**
 * A search-only codec whose key reads a fallback value when it is missing,
 * repeated or invalid, while URL creation may still omit it.
 */
export type FallbackCodec<Value> = ParamCodec<Value> & {
  readonly [searchFallback]: true;
};
export type PathCodec = ParamCodec<any> & { readonly [searchFallback]?: never };
export type CodecValue<Codec> = Codec extends ParamCodec<infer Value> ? Value : never;
export type HasFallback<Codec> = Codec extends { readonly [searchFallback]: true } ? true : false;

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

export function codecFallback(codec: object): { readonly value: unknown } | undefined {
  return fallbacks.get(codec);
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
 * Fallback codecs are search-only: a path param can't use one.
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
 * @throws TypeError if the codec lacks callable parse/stringify methods or already
 * has a fallback.
 */
export function withFallback<Value>(
  codec: ParamCodec<Value> & SyncValue<NoInfer<Value>>,
  fallback: NoInfer<Value>,
): FallbackCodec<Value> {
  validateCodec(codec);

  if (codecFallback(codec)) {
    throw new TypeError("withFallback cannot wrap a codec that already has a fallback");
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

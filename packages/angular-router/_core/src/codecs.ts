/**
 * Converts one decoded path or search value to and from an application value.
 *
 * @remarks
 * Parsing may be asynchronous; stringification must be synchronous. Neither
 * method performs URL encoding. Codecs have no Angular injection-context
 * guarantee, and their returned objects are not recursively frozen.
 * For a terminal `$name[]` path, this codec applies to each element separately.
 *
 * @typeParam Value - The logical value, not a promise of that value.
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
   * @returns The logical value or a promise for it.
   * @throws An application error for invalid input; generated input parsing
   * reports throws and rejections as invalid path/search values with a cause.
   */
  parse(raw: string): Value | Promise<Value>;
  /**
   * Serializes one logical value without percent-encoding it.
   *
   * @param value - The application value to serialize.
   * @returns An unencoded string. Path output must not be empty, `.` or `..`.
   * @throws An application error when the value cannot be serialized.
   */
  stringify(value: Value): string;
}

declare const searchPresence: unique symbol;

/** A search-only codec whose key may be omitted or supplied as `undefined`. */
export type OptionalCodec<Value> = ParamCodec<Value | undefined> & {
  readonly [searchPresence]: "optional";
};
/** A search-only codec that represents explicit `null` as the text `"null"`. */
export type NullableCodec<Value> = ParamCodec<Value | null> & {
  readonly [searchPresence]: "nullable";
};
export type PathCodec = ParamCodec<any> & { readonly [searchPresence]?: never };
export type CodecValue<Codec> = Codec extends ParamCodec<infer Value> ? Value : never;
export type IsOptional<Codec> = Codec extends { readonly [searchPresence]: "optional" }
  ? true
  : false;

const presence = new WeakMap<object, "optional" | "nullable">();

export function codecPresence(codec: object): "optional" | "nullable" | undefined {
  return presence.get(codec);
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
 * Makes a search key optional without changing the handling of present values.
 *
 * @remarks
 * Generated parsing omits absent keys; URL creation omits absent or `undefined`
 * values. The wrapper's parser delegates present strings unchanged, preserving
 * promises and failures. Its stringifier cannot serialize `undefined` directly.
 * This wrapper is not a path codec. For optional nullable values, wrap
 * {@link nullableSearchParam} with this function, not the other way around.
 *
 * @typeParam Value - The wrapped codec's logical value.
 * @param codec - The codec used for present search values.
 * @returns A search-only codec allowing omission.
 * @throws TypeError if the codec lacks callable parse/stringify methods.
 */
export function optionalSearchParam<Value>(codec: ParamCodec<Value>): OptionalCodec<Value> {
  validateCodec(codec);

  const wrapper: ParamCodec<Value | undefined> = {
    parse(raw) {
      return codec.parse(raw);
    },
    stringify(value) {
      if (value === undefined) {
        throw new TypeError("Omitted search has no scalar representation");
      }

      return codec.stringify(value);
    },
  };

  presence.set(wrapper, "optional");

  return wrapper as OptionalCodec<Value>;
}

/**
 * Adds explicit null to a search codec, represented by the decoded text `"null"`.
 *
 * @remarks
 * The key remains required unless wrapped with {@link optionalSearchParam}.
 * Non-null values delegate unchanged, including promise/failure identity. The
 * text `"null"` is reserved by this wrapper even if the inner codec accepts it.
 * This wrapper is not a path codec and cannot wrap an optional search codec.
 *
 * @typeParam Value - The wrapped codec's non-null logical value.
 * @param codec - The codec used for values other than null.
 * @returns A search-only codec accepting and serializing null.
 * @throws TypeError if the codec is malformed or is an optional search wrapper.
 *
 * @example
 * ```ts
 * const score = optionalSearchParam(nullableSearchParam(numberParam));
 * // Omission, null, and a present number remain distinct.
 * ```
 */
export function nullableSearchParam<Value>(
  codec: ParamCodec<Value> & { readonly [searchPresence]?: "nullable" },
): NullableCodec<Value> {
  validateCodec(codec);

  if (codecPresence(codec) === "optional") {
    throw new TypeError("Nullable cannot wrap optional");
  }

  const wrapper: ParamCodec<Value | null> = {
    parse(raw) {
      if (raw === "null") {
        return null;
      }

      return codec.parse(raw);
    },
    stringify(value) {
      if (value === null) {
        return "null";
      }

      return codec.stringify(value);
    },
  };

  presence.set(wrapper, "nullable");

  return wrapper as NullableCodec<Value>;
}

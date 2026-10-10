export interface ParamCodec<Value> {
  parse(raw: string): Value | Promise<Value>;
  stringify(value: Value): string;
}

declare const searchPresence: unique symbol;

export type OptionalCodec<Value> = ParamCodec<Value | undefined> & {
  readonly [searchPresence]: "optional";
};
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

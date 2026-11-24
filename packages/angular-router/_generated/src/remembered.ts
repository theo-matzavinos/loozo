import {
  codecFallback,
  destinationRecord,
  isArrayCodec,
  rememberedId,
  type AnyRoute,
  type Destination,
  type ParamCodec,
} from "@loozo/angular-router/_core";
import { ownerOf, presentValue } from "./search-keys.js";

/** A remembered key of a destination's effective search, its storage id and its owner. */
export interface RememberedKey {
  readonly key: string;
  readonly codec: ParamCodec<any>;
  readonly id: string;
  readonly owner: Destination<AnyRoute>;
}

const noKeys: readonly RememberedKey[] = Object.freeze([]);
const keyCache = new WeakMap<Destination<AnyRoute>, readonly RememberedKey[]>();

/**
 * The remembered keys of a destination's effective search, in declaration order. A named-outlet
 * destination declares no search, so it has none.
 */
export function rememberedKeys(
  destination: Destination<AnyRoute> | undefined,
): readonly RememberedKey[] {
  if (destination === undefined) {
    return noKeys;
  }

  const cached = keyCache.get(destination);

  if (cached) {
    return cached;
  }

  const { url } = destinationRecord(destination);
  const found: RememberedKey[] = [];

  for (const key of Object.keys(url.search)) {
    const codec = url.search[key];
    const id = rememberedId(codec);

    if (id !== undefined) {
      found.push({ key, codec, id, owner: ownerOf(destination, key) });
    }
  }

  let keys = noKeys;

  if (found.length > 0) {
    keys = Object.freeze(found);
  }

  keyCache.set(destination, keys);

  return keys;
}

/**
 * The text a commit stores for a key whose URL values read as a present valid value that isn't
 * its fallback, or undefined when the key should be forgotten: absent, invalid, repeated for a
 * scalar, an empty array (it shares the missing key's URL) or equal to its fallback.
 *
 * @remarks
 * The text is the parsed value written back by the key's codec: each value `codec.stringify`'d
 * and `encodeURIComponent`'d, joined with `&`: `"50"`, `"news&guides"`, `""` for one empty
 * string. Text a codec accepts as an alias is stored in its canonical form, so `numberParam`
 * stores `0x32` as `"50"`. It's a valid cookie value and storage value as is.
 *
 * @throws TypeError when the codec's stringify returns something other than a string.
 */
export function storedText(codec: ParamCodec<any>, raws: readonly string[]): string | undefined {
  const value = presentValue(codec, raws);

  if (value === undefined) {
    return undefined;
  }

  const fallback = codecFallback(codec);

  if (fallback && Object.is(value, fallback.value)) {
    return undefined;
  }

  let values: readonly unknown[] = [value];

  if (isArrayCodec(codec)) {
    values = value as unknown[];
  }

  const parts: string[] = [];

  for (const element of values) {
    const text = codec.stringify(element);

    if (typeof text !== "string") {
      throw new TypeError("Codec stringify must return a string");
    }

    parts.push(encodeURIComponent(text));
  }

  return parts.join("&");
}

/**
 * The URL values stored text holds, when they read as a present valid value of the key; else
 * undefined: malformed percent-encoding, a repeated scalar or a value its codec rejects.
 */
export function storedValues(codec: ParamCodec<any>, text: string): readonly string[] | undefined {
  const raws: string[] = [];

  for (const part of text.split("&")) {
    try {
      raws.push(decodeURIComponent(part));
    } catch (error) {
      if (error instanceof URIError) {
        return undefined;
      }

      throw error;
    }
  }

  if (presentValue(codec, raws) === undefined) {
    return undefined;
  }

  return raws;
}

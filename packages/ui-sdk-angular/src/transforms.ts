import { numberAttribute } from "@angular/core";

/**
 * `booleanAttribute` that keeps `undefined`, so an unset input stays "not passed" to core.
 */
export function optionalBoolean(value: boolean | string | null | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value !== null && value !== false && value !== "false";
}

/**
 * `numberAttribute` that keeps `undefined`, so an unset input stays "not passed" to core.
 */
export function optionalNumber(value: number | string | null | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return numberAttribute(value);
}

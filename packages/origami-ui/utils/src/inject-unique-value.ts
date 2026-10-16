import { assertInInjectionContext, inject } from "@angular/core";
import { IdCounter, assertKey } from "./id-counter";

/**
 * Allocates a value that is unique in the current Angular application, for a `value` input
 * default: `og-<key>-<n>`. It is never rendered. Values are application-local: the server and the
 * browser allocate them independently, so a value isn't guaranteed to match across hydration.
 * Give items an explicit value whenever it must survive hydration or be stored.
 *
 * @param key - The value's namespace, matching `/^[a-z][a-z0-9-]*$/`.
 * @returns A new value.
 * @throws If called outside Angular injection context, or `TypeError` for a key that doesn't match.
 *
 * @example
 * ```ts
 * readonly value = input(injectUniqueValue("menu-item"));
 * ```
 */
export function injectUniqueValue(key: string): string {
  assertInInjectionContext(injectUniqueValue);
  assertKey(key, "injectUniqueValue");

  return `og-${key}-${inject(IdCounter).next(key)}`;
}

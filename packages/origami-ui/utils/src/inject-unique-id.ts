import { ElementRef, assertInInjectionContext, inject } from "@angular/core";
import { IdCounter, assertKey } from "./id-counter";

/**
 * Allocates a DOM element ID that is unique in the current Angular application, for an `id`
 * input default.
 *
 * In the browser it first returns the host element's rendered `id` attribute, so a hydrating
 * host keeps the ID the server rendered. Otherwise it allocates `og-<key>-s<n>` on the server or
 * `og-<key>-<n>` in the browser; the separate namespaces keep client-only allocations from
 * colliding with dehydrated server DOM. Call it once per mounted element and keep the result.
 *
 * @param key - The ID's namespace, matching `/^[a-z][a-z0-9-]*$/`.
 * @returns The host's rendered ID while hydrating, otherwise a new ID.
 * @throws If called outside Angular injection context, or `TypeError` for a key that doesn't match.
 * @remarks Independent applications don't share counters, so document-wide uniqueness across
 * applications is not promised.
 *
 * @example
 * ```ts
 * readonly id = input(injectUniqueId("field-hint"));
 * ```
 */
export function injectUniqueId(key: string): string {
  assertInInjectionContext(injectUniqueId);
  assertKey(key, "injectUniqueId");

  const counter = inject(IdCounter);

  if (counter.server) {
    return `og-${key}-s${counter.next(key)}`;
  }

  const host = inject<ElementRef<unknown>>(ElementRef, { optional: true })?.nativeElement;

  if (host instanceof Element) {
    const rendered = host.getAttribute("id");

    if (rendered !== null && rendered !== "") {
      return rendered;
    }
  }

  return `og-${key}-${counter.next(key)}`;
}

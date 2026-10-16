import { Injector, assertInInjectionContext, inject } from "@angular/core";
import type { ProviderToken } from "@angular/core";

/**
 * Captures the nearest Angular injector without resolving `token` yet.
 *
 * @param token - The value to resolve when the returned function is called.
 * @returns A resolver callable outside injection context, using normal injector caching.
 * @throws If capture occurs outside Angular injection context. Resolution also propagates
 * Angular's missing-provider or destroyed-injector errors.
 *
 * @example
 * ```ts
 * readonly readSettings = injectDeferred(Settings);
 * // Later, in an event handler: this.readSettings();
 * ```
 */
export function injectDeferred<T>(token: ProviderToken<T>): () => T {
  assertInInjectionContext(injectDeferred);

  const injector = inject(Injector);

  return () => injector.get(token);
}

/**
 * Where remembered search values live: synchronous reads and writes of router-formatted text.
 *
 * @remarks
 * Pass a factory returning one to `provideSearchStorage()` from `routes.generated.ts`; it runs
 * once per application, in its environment injection context (once per request on the
 * server). The router stores each value as text that is a valid cookie value and storage
 * value as is, under the id `remembered` was given. The adapter owns its platform checks and
 * its failures: the router doesn't catch them, so a throw from `read` fails the navigation
 * that restores, and a throw from `write` or `forget` reaches Angular's `ErrorHandler`.
 *
 * @example
 * ```ts
 * const memory = new Map<string, string>();
 * const storage: SearchStorage = {
 *   read: (id) => memory.get(id),
 *   write: (id, text) => void memory.set(id, text),
 *   forget: (id) => void memory.delete(id),
 * };
 * ```
 */
export interface SearchStorage {
  /** The text stored for `id`, or undefined. */
  read(id: string): string | undefined;
  /** Stores `text` for `id`, replacing what was stored. */
  write(id: string, text: string): void;
  /** Removes what is stored for `id`; nothing happens when nothing is. */
  forget(id: string): void;
}

/**
 * The current navigation's restore while it can still be retried, from `currentSearchRestore()`
 * in `routes.generated.ts`.
 *
 * @remarks
 * A navigation error handler that recognizes a not-found error asks for it before setting a
 * status: when one is returned, it calls `forget()` and returns a `RedirectCommand` to
 * `originalUrl`, so the page renders with its fallbacks instead of failing on a stored value.
 */
export interface SearchRestore {
  /** The URL this navigation's redirect chain had before its first restore, as Angular serialized it. */
  readonly originalUrl: string;
  /**
   * Forgets every value the chain restored and uses up its one retry: until the chain ends,
   * nothing is restored again and `currentSearchRestore()` returns undefined. Calling it again,
   * or after the chain ended, does nothing.
   */
  forget(): void;
}

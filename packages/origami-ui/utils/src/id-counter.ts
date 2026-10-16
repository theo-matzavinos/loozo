import { PLATFORM_ID, Service, inject } from "@angular/core";
import { isPlatformServer } from "@angular/common";

/** Application-wide allocation counter per key, shared by `injectUniqueId` and `injectUniqueValue`. */
@Service()
export class IdCounter {
  /** True on the server platform, where element IDs take an `s` prefix. */
  readonly server = isPlatformServer(inject(PLATFORM_ID));
  readonly #next = new Map<string, number>();

  /** Returns the key's next number, starting at 0. */
  next(key: string): number {
    const allocated = this.#next.get(key) ?? 0;

    this.#next.set(key, allocated + 1);

    return allocated;
  }
}

/** Throws a `TypeError` unless `key` is a lowercase kebab-case string. */
export function assertKey(key: string, caller: string): void {
  if (typeof key !== "string" || !/^[a-z][a-z0-9-]*$/.test(key)) {
    throw new TypeError(`${caller} requires a key matching /^[a-z][a-z0-9-]*$/.`);
  }
}

import { ElementRef, PLATFORM_ID, Service, assertInInjectionContext, inject } from "@angular/core";
import { isPlatformServer } from "@angular/common";

@Service()
class IdentityAllocation {
  readonly #server = isPlatformServer(inject(PLATFORM_ID));
  readonly #hosts = new WeakMap<Element, { seed: string; occurrences: Map<string, number> }>();
  #next = 0;

  allocate(key: string, host: Element | null): string {
    let encodedKey = "";

    for (let index = 0; index < key.length; index += 1) {
      encodedKey += key.charCodeAt(index).toString(16).padStart(4, "0");
    }

    if (host === null) {
      const seed = this.#allocateSeed();

      return `og-${seed}-${encodedKey}-0`;
    }

    let record = this.#hosts.get(host);

    if (record === undefined) {
      const serializedSeed = host.getAttribute("data-og-identity");
      let seed: string;

      if (!this.#server && serializedSeed !== null && serializedSeed.startsWith("s")) {
        seed = serializedSeed;
      } else {
        // A new application must not import a prior application's client counter
        // namespace when it reuses that application's native host. Only server
        // seeds are serialized hydration identities; known current hosts use the WeakMap.
        seed = this.#allocateSeed();
      }

      host.setAttribute("data-og-identity", seed);
      record = { seed, occurrences: new Map() };
      this.#hosts.set(host, record);
    }

    const occurrence = record.occurrences.get(key) ?? 0;

    record.occurrences.set(key, occurrence + 1);

    return `og-${record.seed}-${encodedKey}-${occurrence}`;
  }

  #allocateSeed(): string {
    const sequence = this.#next;

    this.#next += 1;

    if (this.#server) {
      return `s${sequence}`;
    }

    return `c${sequence}`;
  }
}

/**
 * Allocates an opaque identity in the current Angular application's namespace.
 *
 * Call once per mounted identity and retain the result. Reused SSR element hosts
 * retain their serialized identity seed during eager or deferred hydration, independent
 * of sibling hydration order. Identity is independent of consumer-bound DOM `id`.
 * The internal `data-og-identity` host attribute is reserved for the library.
 *
 * @param key - A losslessly distinguished identity namespace; its spelling is not an ID format.
 * @returns A stable identity for this allocation. Exact spelling and allocation order are opaque.
 * @throws If called outside Angular injection context, or if a JavaScript caller supplies a non-string key.
 * @remarks Any injection context in an Angular application is supported, including
 * application services and environment-provider factories without an element host.
 * Their allocations are application-unique and mounted-stable when retained, but have
 * no server/client matching guarantee, even if later rendered into an SSR node.
 * SSR matching applies only to element-host calls. Independent applications do not
 * share allocation state; document-wide uniqueness across applications is not promised.
 */
export function injectUniqueId(key: string): string {
  assertInInjectionContext(injectUniqueId);

  if (typeof key !== "string") {
    throw new TypeError("injectUniqueId requires a string key.");
  }

  const allocation = inject(IdentityAllocation);
  const element = inject<ElementRef<Element>>(ElementRef, { optional: true });
  let host: Element | null = null;

  if (
    element !== null &&
    typeof element.nativeElement.getAttribute === "function" &&
    typeof element.nativeElement.setAttribute === "function"
  ) {
    host = element.nativeElement;
  }

  return allocation.allocate(key, host);
}

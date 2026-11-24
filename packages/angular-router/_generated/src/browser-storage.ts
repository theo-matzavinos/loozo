import { DOCUMENT, isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID, inject } from "@angular/core";
import type { SearchStorage } from "@loozo/angular-router/_core";

const inert: SearchStorage = Object.freeze({
  read: () => undefined,
  write: () => undefined,
  forget: () => undefined,
});

/**
 * The built-in `"local"` or `"session"` search storage: Web Storage under `search:<id>` in the
 * browser, nothing on the server. Needs an injection context.
 *
 * @remarks
 * The platform comes from `PLATFORM_ID`, never from probing a global: Node can expose a
 * process-wide `localStorage`, which would leak values across requests. Storage the browser
 * blocks (`SecurityError`) or that is full (`QuotaExceededError`) reads nothing and keeps
 * nothing; other errors propagate.
 */
export function browserStorage(kind: "local" | "session"): SearchStorage {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return inert;
  }

  const view = inject(DOCUMENT).defaultView;

  function attempt<Result>(operation: (storage: Storage) => Result): Result | undefined {
    if (view === null) {
      return undefined;
    }

    try {
      // Reading the property throws too when the browser blocks storage for this origin.
      if (kind === "local") {
        return operation(view.localStorage);
      }

      return operation(view.sessionStorage);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "SecurityError" || error.name === "QuotaExceededError")
      ) {
        return undefined;
      }

      throw error;
    }
  }

  return {
    read: (id) => attempt((storage) => storage.getItem(`search:${id}`) ?? undefined),
    write: (id, text) => attempt((storage) => storage.setItem(`search:${id}`, text)),
    forget: (id) => attempt((storage) => storage.removeItem(`search:${id}`)),
  };
}

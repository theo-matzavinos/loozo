import {
  DestroyRef,
  ErrorHandler,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from "@angular/core";
import {
  EventType,
  NavigationCancellationCode,
  Router,
  type Event,
  type RedirectCommand,
} from "@angular/router";
import type { SearchRestore, SearchStorage } from "@loozo/angular-router/_core";
import { deepestDestination } from "./base.js";
import { browserStorage } from "./browser-storage.js";
import { committedChain } from "./committed.js";
import { rememberedKeys, storedText } from "./remembered.js";

/**
 * Navigations joined by redirects: the original one and each redirect continuation, whether a
 * guard, resolver, `canMatch`, restore or navigation error handler redirected.
 */
export interface RedirectChain {
  /** The id of the chain's current navigation. */
  active: number;
  /** Every remembered id restored anywhere in this chain; none is restored twice. */
  readonly ids: Set<string>;
  /** Every remembered id read in this chain: nothing writes during a chain, so none is read twice. */
  readonly read: Set<string>;
  /** The URL of the attempt the chain's first restore redirected from. */
  originalUrl: string | undefined;
  /** The chain's one retry without its restored values was taken. */
  recovered: boolean;
}

/**
 * One per application injector, so one per request on the server: the storage adapter, the
 * current redirect chain and the restore decision of the current navigation. It follows the
 * router's events from before the initial navigation, forgets a chain's restored values when
 * that chain fails, and writes or forgets every remembered key of the committed route at each
 * commit.
 */
export class SearchStore {
  readonly storage: SearchStorage;
  chain: RedirectChain | undefined;
  /** The current navigation's restore decision, made once by the first gate Angular calls. */
  decided: { readonly id: number; readonly result: true | RedirectCommand } | undefined;
  readonly #router = inject(Router);
  readonly #errors = inject(ErrorHandler);
  // Set by the chain's redirect cancellation; the next NavigationStart continues the chain.
  #continuing = false;
  #lastProcessed = 0;

  constructor(storage: SearchStorage) {
    this.storage = storage;

    const subscription = this.#router.events.subscribe((event) => this.#observe(event));

    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /** Forgets `id`, sending an adapter failure to Angular's ErrorHandler like every forget. */
  forget(id: string): void {
    this.#report(() => this.storage.forget(id));
  }

  /** The chain's retry, while its current navigation can still take it. */
  restore(): SearchRestore | undefined {
    const chain = this.chain;

    if (
      chain === undefined ||
      chain.active !== this.#router.currentNavigation()?.id ||
      chain.ids.size === 0 ||
      chain.originalUrl === undefined ||
      chain.recovered
    ) {
      return undefined;
    }

    return Object.freeze({
      originalUrl: chain.originalUrl,
      forget: () => {
        if (this.chain !== chain || chain.recovered) {
          return;
        }

        chain.recovered = true;

        // The ids stay in the chain, so the retry restores none of them again.
        for (const id of chain.ids) {
          this.forget(id);
        }
      },
    });
  }

  #observe(event: Event): void {
    if (event.type === EventType.NavigationStart) {
      if (this.#continuing && this.chain !== undefined) {
        this.chain.active = event.id;
      } else {
        this.chain = {
          active: event.id,
          ids: new Set(),
          read: new Set(),
          originalUrl: undefined,
          recovered: false,
        };
      }

      this.#continuing = false;

      return;
    }

    if (event.type === EventType.NavigationEnd) {
      this.#commit(event.id);
      this.#retire(event.id);

      return;
    }

    if (
      event.type !== EventType.NavigationCancel &&
      event.type !== EventType.NavigationError &&
      event.type !== EventType.NavigationSkipped
    ) {
      return;
    }

    // A redirect continuation Angular ends before its NavigationStart, such as a skip back to
    // the current URL, ends the chain there; a skip isn't a failure, so its values are kept.
    if (this.#continuing && this.chain !== undefined && event.id > this.chain.active) {
      this.chain = undefined;
      this.#continuing = false;

      return;
    }

    // An outcome of a navigation that isn't the chain's current one was superseded already.
    if (event.id !== this.chain?.active) {
      return;
    }

    if (event.type === EventType.NavigationCancel) {
      if (event.code === NavigationCancellationCode.Redirect) {
        this.#continuing = true;

        return;
      }

      if (
        event.code === NavigationCancellationCode.GuardRejected ||
        event.code === NavigationCancellationCode.NoDataFromResolver
      ) {
        this.#forgetRestored(this.chain);
      }
    } else if (event.type === EventType.NavigationError) {
      this.#forgetRestored(this.chain);
    }

    this.#retire(event.id);
  }

  // A chain that fails on its own forgets what it restored, so a value the app now refuses
  // can't fail every later entry. Superseded and aborted chains keep their values.
  #forgetRestored(chain: RedirectChain): void {
    for (const id of chain.ids) {
      this.forget(id);
    }
  }

  // Router events reach no navigation's error path: an adapter's write or forget failure goes
  // to Angular's ErrorHandler, and the remaining operations and the chain's bookkeeping go on.
  #report(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.#errors.handleError(error);
    }
  }

  #retire(id: number): void {
    if (this.chain?.active === id) {
      this.chain = undefined;
      this.#continuing = false;
    }
  }

  #commit(id: number): void {
    const success = this.#router.lastSuccessfulNavigation();

    if (success?.id !== id || id <= this.#lastProcessed) {
      return;
    }

    // A navigation started while this one's NavigationEnd was delivered replaced the tree
    // already; its own NavigationEnd writes.
    if (committedChain(this.#router, success) === undefined) {
      return;
    }

    this.#lastProcessed = id;

    const root = this.#router.routerState.snapshot.root;

    for (const { key, codec, id: storageId } of rememberedKeys(deepestDestination(root))) {
      const text = storedText(codec, root.queryParamMap.getAll(key));

      if (text === undefined) {
        this.forget(storageId);
      } else {
        this.#report(() => this.storage.write(storageId, text));
      }
    }
  }
}

/** This application's search store, when it installs provideSearchStorage(). */
export const SEARCH_STORE = new InjectionToken<SearchStore>("@loozo/angular-router search store");

/**
 * Remembers the search keys routes mark with `remembered`, in browser storage or in an adapter
 * the factory returns. Install it once, in the application config shared by the server and the
 * browser.
 *
 * @remarks
 * `"local"` and `"session"` use the browser's Web Storage under `search:<id>` and store nothing
 * on the server, so a server-rendered page shows the fallback until the browser restores. A
 * factory runs once per application in its environment injection context (once per request
 * on the server); return a cookie adapter there to make the server's first render use the
 * remembered values. A navigation into a route with a remembered key fails without this
 * provider.
 *
 * @param storage - `"local"`, `"session"`, or a factory returning a `SearchStorage`.
 * @throws TypeError for any other argument; a factory that returns no adapter fails when the
 * application starts.
 */
export function provideSearchStorage(
  storage: "local" | "session" | (() => SearchStorage),
): EnvironmentProviders {
  let create: () => SearchStorage;

  if (storage === "local" || storage === "session") {
    create = () => browserStorage(storage);
  } else if (typeof storage === "function") {
    create = storage;
  } else {
    throw new TypeError('provideSearchStorage takes "local", "session" or a storage factory');
  }

  return makeEnvironmentProviders([
    {
      provide: SEARCH_STORE,
      useFactory: () => {
        const adapter = create();

        if (
          adapter === null ||
          typeof adapter !== "object" ||
          typeof adapter.read !== "function" ||
          typeof adapter.write !== "function" ||
          typeof adapter.forget !== "function"
        ) {
          throw new TypeError("Search storage must have read, write and forget methods");
        }

        return new SearchStore(adapter);
      },
    },
    // Environment initializers run before the router's initial navigation, which the store
    // must see start.
    provideEnvironmentInitializer(() => {
      inject(SEARCH_STORE);
    }),
  ]);
}

/**
 * The current navigation's restore, while it can still be retried; otherwise undefined.
 *
 * @remarks
 * Call it in an injection context, from a navigation error handler (Angular runs one in the
 * application's injection context). It returns a `SearchRestore` only during the failing
 * navigation of a redirect chain that restored a remembered value and hasn't retried yet.
 * Without `provideSearchStorage()` it returns undefined and creates nothing.
 */
export function currentSearchRestore(): SearchRestore | undefined {
  return inject(SEARCH_STORE, { optional: true })?.restore();
}

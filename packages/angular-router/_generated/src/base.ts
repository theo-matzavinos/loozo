import {
  DestroyRef,
  InjectionToken,
  PLATFORM_ID,
  inject,
  signal,
  type Signal,
} from "@angular/core";
import { Location, isPlatformServer } from "@angular/common";
import { PRIMARY_OUTLET, Router, UrlTree, type ActivatedRouteSnapshot } from "@angular/router";
import { destinationRecord, type AnyRoute, type Destination } from "@loozo/angular-router/_core";
import { SEED, type SeededChain } from "./hydration.js";
import { recordFacts } from "./record.js";

/** The URL typed navigation composes with, and the declarations that URL is inside. */
export interface NavigationState {
  /** The current URL. */
  readonly tree: UrlTree;
  /**
   * The declaration ancestry of the URL's deepest generated primary record, read from a state
   * of that same URL; empty when no such state is known.
   */
  readonly owners: ReadonlySet<Destination<AnyRoute>>;
}

/**
 * Counts the browser URL changes `Location` reports: the router's writes, eager ones included,
 * and history traversals. Angular's own navigation signals don't change when it writes the
 * eager URL, so callers before the first success read this to follow the address bar.
 */
const BROWSER_URL_CHANGES = new InjectionToken<Signal<number>>("BROWSER_URL_CHANGES", {
  providedIn: "root",
  factory: () => {
    const changes = signal(0);
    const remove = inject(Location).onUrlChange(() => changes.update((count) => count + 1));

    inject(DestroyRef).onDestroy(remove);

    return changes.asReadonly();
  },
});

const noOwners: ReadonlySet<Destination<AnyRoute>> = new Set();
// The router state's snapshot or the seed's chain, to the declarations its URL is inside.
const ownerCache = new WeakMap<object, ReadonlySet<Destination<AnyRoute>>>();

/**
 * The URL typed navigation composes with and its owners, as a function that injects nothing.
 *
 * @remarks
 * Call it once in an injection context; the returned function reads the router at each
 * call, the URL and its owners together. In the browser, before the first successful
 * navigation, the URL is the browser URL, which Angular's initial navigation reads; its
 * owners come from the router state when that state's URL equals it (Angular installed it
 * for this navigation), else from the published hydration seed when the seed's URL equals
 * it, else there are none. Otherwise the URL and the owners are the router state's. Each
 * call reads `lastSuccessfulNavigation()` and the seed's state, and before the first success
 * a count of the browser URL changes `Location` reports, so template and `computed` callers
 * re-run after every success, when the seed changes and, until the first success, when the
 * browser URL changes (an eager URL update included).
 */
export function injectNavigationState(): () => NavigationState {
  const router = inject(Router);
  const location = inject(Location);
  const server = isPlatformServer(inject(PLATFORM_ID));
  const seed = inject(SEED, { optional: true });
  const urlChanges = server ? undefined : inject(BROWSER_URL_CHANGES);

  return () => {
    const success = router.lastSuccessfulNavigation();
    const snapshot = router.routerState.snapshot;

    if (success !== null || server) {
      return { tree: router.parseUrl(snapshot.url), owners: stateOwners(snapshot.root) };
    }

    urlChanges?.();

    const current = browserUrl(router, location);
    const seedState = seed?.state();

    // Angular's initial state has the URL '', which never equals a browser URL.
    if (snapshot.url !== "" && withoutFragment(router, snapshot.url) === current.url) {
      return { tree: current.tree, owners: stateOwners(snapshot.root) };
    }

    if (seedState?.kind === "published" && seedState.url === current.url) {
      return { tree: current.tree, owners: seedOwners(seedState.chain) };
    }

    return { tree: current.tree, owners: noOwners };
  };
}

/** The URL Angular's initial navigation reads, and its serialization without the fragment. */
export function browserUrl(router: Router, location: Location): { tree: UrlTree; url: string } {
  const tree = router.parseUrl(location.path(true));
  const url = router.serializeUrl(new UrlTree(tree.root, tree.queryParams));

  return { tree, url };
}

function withoutFragment(router: Router, url: string): string {
  const tree = router.parseUrl(url);

  return router.serializeUrl(new UrlTree(tree.root, tree.queryParams));
}

function stateOwners(root: ActivatedRouteSnapshot): ReadonlySet<Destination<AnyRoute>> {
  const cached = ownerCache.get(root);

  if (cached) {
    return cached;
  }

  let deepest: Destination<AnyRoute> | undefined;

  for (
    let snapshot: ActivatedRouteSnapshot | undefined = root;
    snapshot;
    snapshot = snapshot.children.find((child) => child.outlet === PRIMARY_OUTLET)
  ) {
    const facts = recordFacts(snapshot.routeConfig);

    if (facts) {
      deepest = facts.destination;
    }
  }

  const owners = ancestry(deepest);

  ownerCache.set(root, owners);

  return owners;
}

function seedOwners(chain: SeededChain): ReadonlySet<Destination<AnyRoute>> {
  const cached = ownerCache.get(chain);

  if (cached) {
    return cached;
  }

  const owners = ancestry(recordFacts(chain.at(-1)?.record)?.destination);

  ownerCache.set(chain, owners);

  return owners;
}

function ancestry(
  destination: Destination<AnyRoute> | undefined,
): ReadonlySet<Destination<AnyRoute>> {
  const owners = new Set<Destination<AnyRoute>>();

  for (
    let owner: Destination<AnyRoute> | undefined = destination;
    owner;
    owner = destinationRecord(owner).url.parent
  ) {
    owners.add(owner);
  }

  return owners;
}

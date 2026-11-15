import { DestroyRef, computed, inject, untracked, type Signal } from "@angular/core";
import {
  NavigationEnd,
  Router,
  type ActivatedRoute,
  type ActivatedRouteSnapshot,
  type Navigation,
} from "@angular/router";
import {
  destinationRecord,
  routeMetadata,
  type AnyRoute,
  type Destination,
} from "@loozo/angular-router/_core";
import { observeRoute } from "./handle.js";
import { createHandle, type Handle } from "./index.js";
import { destinationOf, routeIdentity } from "./inputs.js";

interface ActiveEntryHandle extends Handle<AnyRoute, Destination<AnyRoute>> {
  is(destination: unknown): boolean;
  contains(destination: unknown): boolean;
  readonly chain: readonly ActiveEntryHandle[];
}

interface Entry {
  readonly handle: ActiveEntryHandle;
  readonly parent: Entry | undefined;
  readonly release: () => void;
}

/**
 * One reader of the deepest active primary-outlet route of a generated tree.
 *
 * @remarks
 * `table` maps each retained route's generated id to its route copy and, when it has
 * one, the destination of its `..` target. It is read when the reader is injected,
 * never while a module evaluates. Active records whose id isn't in the table are
 * skipped. `is` and `contains` take a genuine destination and compare identities: a
 * genuine destination of another tree is never active here.
 *
 * The selection changes only after a navigation commits: the computed tracks
 * `lastSuccessfulNavigation`, and a reader first read before its tree has committed
 * returns undefined until the running navigation ends. The reader reads itself at each
 * `NavigationEnd`, so it reconciles every commit even without a live consumer. It owns
 * one entry per active ActivatedRoute, reused while that record stays in the chain;
 * departed entries are released at the commit and keep their last values. Destroying
 * the injection context releases the rest; the reader then keeps its last selection.
 */
export function injectGeneratedActiveRoute<Active>(
  table: Readonly<Record<string, readonly [AnyRoute, Destination<AnyRoute>?]>>,
): Signal<Active | undefined> {
  const router = inject(Router);
  const destroyRef = inject(DestroyRef);
  const entries = new Map<ActivatedRoute, Entry>();
  let destroyed = false;
  let selected: ActiveEntryHandle | undefined;

  function createEntry(
    activated: ActivatedRoute,
    [route, up]: readonly [AnyRoute, Destination<AnyRoute>?],
    parent: Entry | undefined,
  ): Entry {
    const releases: (() => void)[] = [];
    const view = observeRoute(route, activated, router, (release) => {
      releases.push(release);
    });
    const own = destinationOf(route);
    // The destinations of the route copy and its parent copies.
    const destinations: Destination<AnyRoute>[] = [];

    for (let owner: AnyRoute | undefined = route; owner; owner = routeMetadata(owner).parent) {
      destinations.push(destinationOf(owner));
    }

    const chain: ActiveEntryHandle[] = [...(parent?.handle.chain ?? [])];
    const base = createHandle(route, up, router, view);
    const handle: ActiveEntryHandle = {
      ...base,
      is: (destination) => {
        destinationRecord(destination);

        return destination === own;
      },
      contains: (destination) => {
        destinationRecord(destination);

        return destinations.includes(destination as Destination<AnyRoute>);
      },
      chain,
    };

    chain.push(handle);
    Object.freeze(chain);

    return {
      handle,
      parent,
      release: () => {
        for (const release of releases) {
          release();
        }
      },
    };
  }

  // Reuses each entry whose record and parent entry are unchanged, then releases the rest.
  function reconcile(live: readonly ActivatedRoute[]): ActiveEntryHandle | undefined {
    const kept = new Set<ActivatedRoute>();
    let parent: Entry | undefined;

    for (const activated of live) {
      const id = routeIdentity(activated);

      if (typeof id !== "string" || !Object.hasOwn(table, id)) {
        continue;
      }

      let entry = entries.get(activated);

      if (entry && entry.parent !== parent) {
        entry.release();
        entry = undefined;
      }

      if (!entry) {
        entry = createEntry(activated, table[id], parent);
        entries.set(activated, entry);
      }

      kept.add(activated);
      parent = entry;
    }

    for (const [route, entry] of entries) {
      if (!kept.has(route)) {
        entry.release();
        entries.delete(route);
      }
    }

    return parent?.handle;
  }

  const selection = computed(() => {
    // Reads no signal, so a destroyed reader never recomputes or subscribes again.
    if (destroyed) {
      return selected as Active | undefined;
    }

    const success = router.lastSuccessfulNavigation();
    const live = untracked(() => committedChain(router, success));

    if (!live) {
      // Wait for the running navigation to end, whether it succeeds, cancels or fails.
      router.currentNavigation();
      selected = undefined;

      return undefined;
    }

    // Subscriptions start here, outside the reactive context.
    selected = untracked(() => reconcile(live));

    return selected as Active | undefined;
  });

  // Without this, a reader nobody read at a commit would first recompute during a later
  // activation, against a tree that hasn't committed yet.
  const commits = router.events.subscribe((event) => {
    if (event instanceof NavigationEnd) {
      selection();
    }
  });

  destroyRef.onDestroy(() => {
    destroyed = true;
    commits.unsubscribe();

    for (const entry of entries.values()) {
      entry.release();
    }

    entries.clear();
  });

  return selection;
}

/**
 * The live primary chain, root first, when it is the committed tree; otherwise undefined.
 *
 * @remarks
 * Angular replaces the router state and advances each route's snapshot during
 * activation, before the navigation succeeds. The tree is committed when every live
 * route holds the state's snapshot at its depth, and either no navigation runs or the
 * state is the last successful navigation's final URL.
 */
function committedChain(router: Router, success: Navigation | null): ActivatedRoute[] | undefined {
  const state = router.routerState;
  const live: ActivatedRoute[] = [];
  let route: ActivatedRoute | null = state.root;
  let snapshot: ActivatedRouteSnapshot | null = state.snapshot.root;

  while (route) {
    if (route.snapshot !== snapshot) {
      return undefined;
    }

    live.push(route);
    route = route.firstChild;
    snapshot = snapshot.firstChild;
  }

  if (snapshot !== null) {
    return undefined;
  }

  if (router.currentNavigation() === null) {
    return live;
  }

  if (success?.finalUrl && router.serializeUrl(success.finalUrl) === state.snapshot.url) {
    return live;
  }

  return undefined;
}

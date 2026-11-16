import { DestroyRef, computed, inject, untracked, type Signal } from "@angular/core";
import {
  NavigationEnd,
  Router,
  type ActivatedRoute,
  type ActivatedRouteSnapshot,
  type Navigation,
} from "@angular/router";
import { destinationRecord, type AnyRoute, type Destination } from "@loozo/angular-router/_core";
import { observeRecord } from "./handle.js";
import { createDestinationHandle, type Handle } from "./index.js";
import { recordFacts, type RecordFacts } from "./record.js";

/** One generated route's types: its schema and, when it has one, its `..` destination. */
export interface RouteTypeEntry {
  readonly schema: AnyRoute;
  readonly up?: Destination<AnyRoute>;
}

/** Each generated route's types by id, as `routes.generated.ts` emits them in `RouteTypes`. */
export type RouteTypeMap = { readonly [id: string]: RouteTypeEntry };

type UpOf<Entry> = Entry extends { readonly up: infer Up extends Destination<AnyRoute> }
  ? Up
  : never;

interface ActiveBase<Types extends RouteTypeMap> {
  /** Exactly this route, not an ancestor. Narrows to that route's handle. */
  is<Id extends keyof Types & string>(
    destination: Destination<any, Id>,
  ): this is ActiveHandle<Types, Id>;
  /** This route or one of its active ancestors. */
  contains(destination: Destination<any, keyof Types & string>): boolean;
  /** Active generated routes, top-level first, ending with this one. */
  readonly chain: readonly ActiveRoute<Types>[];
}

/** An active route narrowed by is(): that declaration's handle. */
export type ActiveHandle<Types extends RouteTypeMap, Id extends keyof Types> = Handle<
  Types[Id]["schema"],
  UpOf<Types[Id]>
> &
  ActiveBase<Types>;

/**
 * An active route before narrowing: params, search, data and title read as the union of
 * the tree's values; link and navigate need is().
 */
export type ActiveRoute<Types extends RouteTypeMap> = Pick<
  Handle<Types[keyof Types]["schema"]>,
  "params" | "search" | "data" | "title"
> &
  ActiveBase<Types>;

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
 * One reader of the deepest active primary-outlet generated route. `routes.generated.ts`
 * wraps it with its `RouteTypes`.
 *
 * @remarks
 * Each active record's own generated facts give its destination and `..` target; native
 * records, which carry none, are skipped, and nothing filters generated records by tree.
 * `is` and `contains` take a genuine destination and compare identities.
 *
 * The selection changes only after a navigation commits: the computed tracks
 * `lastSuccessfulNavigation`, and a reader first read before its tree has committed
 * returns undefined until the running navigation ends. The reader reads itself at each
 * `NavigationEnd`, so it reconciles every commit even without a live consumer. It owns
 * one entry per active ActivatedRoute, reused while that record stays in the chain;
 * departed entries are released at the commit and keep their last values. Destroying
 * the injection context releases the rest; the reader then keeps its last selection.
 */
export function injectGeneratedActiveRoute<Types extends RouteTypeMap>(): Signal<
  ActiveRoute<Types> | undefined
> {
  const router = inject(Router);
  const destroyRef = inject(DestroyRef);
  const entries = new Map<ActivatedRoute, Entry>();
  let destroyed = false;
  let selected: ActiveEntryHandle | undefined;

  function createEntry(
    activated: ActivatedRoute,
    { destination: own, up }: RecordFacts,
    parent: Entry | undefined,
  ): Entry {
    const releases: (() => void)[] = [];
    const view = observeRecord(own, activated, router, (release) => {
      releases.push(release);
    });
    // The own destination and its declaration ancestors'.
    const destinations: Destination<AnyRoute>[] = [];

    for (
      let owner: Destination<AnyRoute> | undefined = own;
      owner;
      owner = destinationRecord(owner).url.parent
    ) {
      destinations.push(owner);
    }

    const chain: ActiveEntryHandle[] = [...(parent?.handle.chain ?? [])];
    const base = createDestinationHandle(own, up, router, view);
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
      const facts = recordFacts(activated.routeConfig);

      if (!facts) {
        continue;
      }

      let entry = entries.get(activated);

      if (entry && entry.parent !== parent) {
        entry.release();
        entry = undefined;
      }

      if (!entry) {
        entry = createEntry(activated, facts, parent);
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
      return selected as ActiveRoute<Types> | undefined;
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

    return selected as ActiveRoute<Types> | undefined;
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

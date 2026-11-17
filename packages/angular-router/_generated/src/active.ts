import {
  DestroyRef,
  computed,
  inject,
  signal,
  untracked,
  type Signal,
  type WritableSignal,
} from "@angular/core";
import { NavigationEnd, Router, type ActivatedRoute } from "@angular/router";
import { destinationRecord, type AnyRoute, type Destination } from "@loozo/angular-router/_core";
import { committedChain } from "./committed.js";
import { observeRecord, seededView, type RouteView } from "./handle.js";
import { SEED, type SeededChain } from "./hydration.js";
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

/** A reader's entry for a seeded record, over a view that forwards to `source`. */
interface SeededEntry {
  readonly entry: Entry;
  readonly destination: Destination<AnyRoute>;
  /** The seeded values until adoption hands it the live record's. */
  readonly source: WritableSignal<RouteView>;
  /** The entry's release list, which adoption adds the live record's release to. */
  readonly releases: (() => void)[];
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
 *
 * With provideActiveRouteHydration(), before the first commit and while the seed is
 * published, the reader selects its own seeded entries instead, built once from the seed's
 * chain. Its first live reconcile adopts them, top-level first and only while each matches
 * the live record's destination below an adopted parent, when the seed was handed over to
 * that same commit; otherwise, and once that reconcile is done, it drops them for good.
 */
export function injectGeneratedActiveRoute<Types extends RouteTypeMap>(): Signal<
  ActiveRoute<Types> | undefined
> {
  const router = inject(Router);
  const destroyRef = inject(DestroyRef);
  const seed = inject(SEED, { optional: true });
  const entries = new Map<ActivatedRoute, Entry>();
  let seeded: readonly SeededEntry[] | undefined;
  let destroyed = false;
  let selected: ActiveEntryHandle | undefined;

  function createEntry(
    view: RouteView,
    releases: readonly (() => void)[],
    { destination: own, up }: RecordFacts,
    parent: Entry | undefined,
  ): Entry {
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

  function observe(
    activated: ActivatedRoute,
    destination: Destination<AnyRoute>,
    releases: (() => void)[],
  ): RouteView {
    return observeRecord(destination, activated, router, (release) => {
      releases.push(release);
    });
  }

  function createLiveEntry(
    activated: ActivatedRoute,
    facts: RecordFacts,
    parent: Entry | undefined,
  ): Entry {
    const releases: (() => void)[] = [];

    return createEntry(observe(activated, facts.destination, releases), releases, facts, parent);
  }

  // Seeded entries hold no subscriptions until adoption.
  function createSeeded(chain: SeededChain): SeededEntry[] {
    const created: SeededEntry[] = [];
    let parent: Entry | undefined;

    for (const { record, snapshot } of chain) {
      const facts = recordFacts(record);

      if (!facts) {
        throw new Error("A seeded record carries no generated route facts");
      }

      const source = signal<RouteView>(seededView(facts.destination, snapshot));
      const view: RouteView = {
        params: computed(() => source().params()),
        search: computed(() => source().search()),
        data: computed(() => source().data()),
        title: computed(() => source().title()),
      };
      const releases: (() => void)[] = [];
      const entry = createEntry(view, releases, facts, parent);

      created.push({ entry, destination: facts.destination, source, releases });
      parent = entry;
    }

    return created;
  }

  // Reuses each entry whose record and parent entry are unchanged, then releases the rest. A
  // new entry at generated depth k adopts seeded entry k when its parent is the entry just
  // kept (so every seeded entry above it was adopted) and it carries the live destination.
  function reconcile(
    live: readonly ActivatedRoute[],
    adoptable: readonly SeededEntry[],
  ): ActiveEntryHandle | undefined {
    const kept = new Set<ActivatedRoute>();
    let parent: Entry | undefined;
    let depth = 0;

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
        const candidate = adoptable.at(depth);

        if (
          candidate &&
          candidate.entry.parent === parent &&
          candidate.destination === facts.destination
        ) {
          candidate.source.set(observe(activated, facts.destination, candidate.releases));
          entry = candidate.entry;
        } else {
          entry = createLiveEntry(activated, facts, parent);
        }

        entries.set(activated, entry);
      }

      kept.add(activated);
      parent = entry;
      depth += 1;
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
    const state = seed?.state();

    if (success === null && state?.kind === "published") {
      const own = seeded ?? untracked(() => createSeeded(state.chain));

      seeded = own;
      selected = own.at(-1)?.entry.handle;

      return selected as ActiveRoute<Types> | undefined;
    }

    const live = untracked(() => committedChain(router, success));

    if (!live) {
      // Wait for the running navigation to end, whether it succeeds, cancels or fails.
      router.currentNavigation();

      // Retired before any commit: never adopted.
      if (success === null) {
        seeded = undefined;
      }

      selected = undefined;

      return undefined;
    }

    let adoptable: readonly SeededEntry[] = [];

    if (
      seeded &&
      success !== null &&
      (state?.kind === "published" ||
        (state?.kind === "handedOver" && state.navigation === success.id))
    ) {
      adoptable = seeded;
    }

    // Unadopted seeded handles depart here and keep their seeded values.
    seeded = undefined;
    // Subscriptions start here, outside the reactive context.
    selected = untracked(() => reconcile(live, adoptable));

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

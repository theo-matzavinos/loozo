import {
  DestroyRef,
  Injector,
  computed,
  inject,
  signal,
  untracked,
  type Signal,
  type WritableSignal,
} from "@angular/core";
import { NavigationEnd, Router, type ActivatedRoute, type Route } from "@angular/router";
import {
  codecFallback,
  destinationRecord,
  localeUrls,
  type AnyRoute,
  type Destination,
  type LocaleUrl,
  type UrlValues,
} from "@loozo/angular-router/_core";
import { injectNavigationBase } from "./base.js";
import { committedChain } from "./committed.js";
import { observeRecord, seededView, type RouteView } from "./handle.js";
import { SEED, type SeededChain } from "./hydration.js";
import {
  addMembers,
  createDestinationHandle,
  type DestinationNavigation,
  type Handle,
} from "./index.js";
import { recordExtension, recordFacts, type RecordFacts } from "./record.js";

/**
 * One generated route's types: its schema, its `..` destination when it has one, and the
 * members its route extension adds to its handles, when generation was told of any.
 */
export interface RouteTypeEntry {
  readonly schema: AnyRoute;
  readonly up?: Destination<AnyRoute>;
  readonly members?: object;
}

/** Each generated primary-outlet route's types by id, as `routes.generated.ts` emits them in `RouteTypes`. */
export type RouteTypeMap = { readonly [id: string]: RouteTypeEntry };

type UpOf<Entry> = Entry extends { readonly up: infer Up extends Destination<AnyRoute> }
  ? Up
  : never;
type MembersOf<Entry> = Entry extends { readonly members: infer Members } ? Members : {};

interface ActiveBase<Types extends RouteTypeMap> {
  /** Exactly this route, not an ancestor. Narrows to that route's handle. */
  is<Id extends keyof Types & string>(
    destination: Destination<any, Id>,
  ): this is ActiveHandle<Types, Id>;
  /** This route or one of its active ancestors. */
  contains(destination: Destination<any, keyof Types & string>): boolean;
  /** Active generated routes, top-level first, ending with this one. */
  readonly chain: readonly ActiveRoute<Types>[];
  /**
   * This page in every locale of a localized build, as `localeUrls` gives it for this
   * route's current params and search: search values equal to their fallback and
   * undeclared query keys left out, no fragment. Empty without a locale table.
   */
  readonly localeUrls: Signal<readonly LocaleUrl[]>;
}

/** An active route narrowed by is(): that declaration's handle, with its extension's members. */
export type ActiveHandle<Types extends RouteTypeMap, Id extends keyof Types> = Handle<
  Types[Id]["schema"],
  UpOf<Types[Id]>
> &
  MembersOf<Types[Id]> &
  ActiveBase<Types>;

/**
 * An active route before narrowing: params, search, data and title read as the union of
 * the tree's values; link and navigate take a destination (`to`), its close included,
 * and its own and `..` forms need is().
 */
export type ActiveRoute<Types extends RouteTypeMap> = Pick<
  Handle<Types[keyof Types]["schema"]>,
  "params" | "search" | "data" | "title"
> &
  ActiveBase<Types> &
  DestinationNavigation;

interface ActiveEntryHandle extends Handle<AnyRoute, Destination<AnyRoute>> {
  is(destination: unknown): boolean;
  contains(destination: unknown): boolean;
  readonly chain: readonly ActiveEntryHandle[];
  readonly localeUrls: Signal<readonly LocaleUrl[]>;
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
 * The URL values of a page as `localeUrls` takes them: its current params and search, without
 * the search values that equal their fallback, which a missing key reads as anyway, and without
 * a fragment.
 */
function currentValues(destination: Destination<AnyRoute>, view: RouteView): UrlValues<AnyRoute> {
  const { url } = destinationRecord(destination);
  const values: Record<string, unknown> = {};

  if (Object.keys(url.params).length > 0) {
    values.params = view.params();
  }

  const keys = Object.keys(url.search);

  if (keys.length === 0) {
    return values as unknown as UrlValues<AnyRoute>;
  }

  const read = view.search();
  // Null-prototype, as the parsed search is: a declared `__proto__` key stays an own entry.
  const search: Record<string, unknown> = Object.create(null);

  for (const key of keys) {
    if (!Object.hasOwn(read, key)) {
      continue;
    }

    const value = read[key];
    const fallback = codecFallback(url.search[key]);

    if (fallback && Object.is(value, fallback.value)) {
      continue;
    }

    search[key] = value;
  }

  values.search = search;

  return values as unknown as UrlValues<AnyRoute>;
}

/**
 * One reader of the deepest active primary-outlet generated route. `routes.generated.ts`
 * wraps it with its `RouteTypes`.
 *
 * @remarks
 * The reader walks the primary child at each level, never a named outlet's, so it never
 * selects a named-outlet record. Each active record's own generated facts give its
 * destination and `..` target; native records, which carry none, are skipped.
 * `is` and `contains` take a genuine destination and compare identities. A record stamped
 * with its route extension gives its entry that extension's members, built with this
 * reader's injector, once per entry.
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
 *
 * Every handle the reader creates, seeded, live or at a later commit, composes its links
 * with the URL from one navigation base this call injects, so creating and using a handle
 * needs no injection context. Before narrowing, `link` and `navigate` take a destination.
 */
export function injectGeneratedActiveRoute<Types extends RouteTypeMap>(): Signal<
  ActiveRoute<Types> | undefined
> {
  const router = inject(Router);
  const destroyRef = inject(DestroyRef);
  const seed = inject(SEED, { optional: true });
  const base = injectNavigationBase();
  // Extension members build with the reader's injector: Angular exposes no activated
  // route's environment injector.
  const injector = inject(Injector);
  const entries = new Map<ActivatedRoute, Entry>();
  let seeded: readonly SeededEntry[] | undefined;
  let destroyed = false;
  let selected: ActiveEntryHandle | undefined;

  function createEntry(
    record: Route | null,
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
    const destinationHandle = createDestinationHandle(own, up, router, view, base);
    const handle: ActiveEntryHandle = {
      ...destinationHandle,
      is: (destination) => {
        destinationRecord(destination);

        return destination === own;
      },
      contains: (destination) => {
        destinationRecord(destination);

        return destinations.includes(destination as Destination<AnyRoute>);
      },
      chain,
      localeUrls: computed(() => localeUrls(own, currentValues(own, view))),
    };

    // After the spread: the base holds plain values only, and the members' getters must
    // stay unevaluated until read.
    const stamp = recordExtension(record);

    if (stamp) {
      addMembers(handle, stamp.runtime, stamp.chain, injector);
    }

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

    return createEntry(
      activated.routeConfig,
      observe(activated, facts.destination, releases),
      releases,
      facts,
      parent,
    );
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
      const entry = createEntry(record, view, releases, facts, parent);

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

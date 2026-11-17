import {
  DestroyRef,
  InjectionToken,
  PLATFORM_ID,
  TransferState,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  makeStateKey,
  provideAppInitializer,
  provideEnvironmentInitializer,
  signal,
  untracked,
  type EnvironmentProviders,
  type Signal,
} from "@angular/core";
import { Location, isPlatformServer } from "@angular/common";
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  PRIMARY_OUTLET,
  Router,
  UrlTree,
  type Event,
  type LoadChildren,
  type Route,
  type Routes,
  type UrlSegment,
} from "@angular/router";
import { destinationRecord, type AnyRoute, type Destination } from "@loozo/angular-router/_core";
import type { Subscription } from "rxjs";
import { committedChain } from "./committed.js";
import { parseInputs, type SnapshotLike } from "./inputs.js";
import { recordFacts, resolverKeys } from "./record.js";

/** One generated record of the server's committed primary chain. */
interface SeededRoute {
  /** destinationRecord(destination).id: private, not an API. */
  readonly id: string;
  /** The primary segments [from, to) of the URL's primary segment list the record consumed. */
  readonly from: number;
  readonly to: number;
  /** The record's own authored resolver results, all transferable. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** Only when the record declares a title. */
  readonly title?: string;
}

/** What the server sends: same build, same generated routes, so it carries no version. */
interface ActiveRouteSeed {
  /** The server's committed URL, router.serializeUrl(finalUrl) without its fragment. */
  readonly url: string;
  /** Generated records of the committed primary chain, top-level first. */
  readonly routes: readonly SeededRoute[];
}

const KEY = makeStateKey<ActiveRouteSeed>("@loozo/angular-router:active-route");

/** A seeded generated record: its genuine route record and the plain snapshot standing in for it. */
export interface SeededRecord {
  readonly record: Route;
  readonly snapshot: SnapshotLike;
}

/** The seeded generated records, top-level first. */
export type SeededChain = readonly SeededRecord[];

/**
 * The seed's lifecycle on one application injector. It leaves `waiting` and `published`
 * only for `handedOver` or `retired`, and never returns to either.
 */
export type SeedState =
  /** No key, or not the browser. */
  | { readonly kind: "none" }
  /** Observed: the app initializer checks the seed and loads its records. */
  | { readonly kind: "waiting"; readonly seed: ActiveRouteSeed }
  /** Readers show it until the first terminal navigation outcome. */
  | { readonly kind: "published"; readonly chain: SeededChain }
  /** That navigation committed: readers may adopt their seeded handles at its commit. */
  | { readonly kind: "handedOver"; readonly navigation: number }
  /** Never shown again. */
  | { readonly kind: "retired" };

/** What readers see of the seed. Provided only by provideActiveRouteHydration(). */
export interface SeedContext {
  readonly state: Signal<SeedState>;
}

const retired: SeedState = Object.freeze({ kind: "retired" });

/**
 * Owns the seed's state and its router-events subscription. Only `settle` changes the state:
 * once it is `handedOver` or `retired`, it ignores every write and the subscription is gone.
 */
class SeedControl implements SeedContext {
  readonly #state = signal<SeedState>({ kind: "none" });
  readonly state = this.#state.asReadonly();
  #events: Subscription | undefined;

  settle(next: SeedState): void {
    const current = untracked(this.#state);

    if (current.kind === "handedOver" || current.kind === "retired") {
      return;
    }

    this.#state.set(next);

    if (next.kind === "handedOver" || next.kind === "retired") {
      this.#events?.unsubscribe();
      this.#events = undefined;
    }
  }

  /** Follows navigation outcomes from now until the seed is handed over or retired. */
  observe(router: Router, destroyRef: DestroyRef): void {
    this.#events = router.events.subscribe((event) => {
      this.#outcome(router, event);
    });
    destroyRef.onDestroy(() => {
      this.#events?.unsubscribe();
    });
  }

  // A redirect or a superseding navigation leaves the seed for the navigation that follows.
  #outcome(router: Router, event: Event): void {
    if (event instanceof NavigationCancel) {
      if (
        event.code === NavigationCancellationCode.Redirect ||
        event.code === NavigationCancellationCode.SupersededByNewNavigation
      ) {
        return;
      }
    } else if (
      !(
        event instanceof NavigationEnd ||
        event instanceof NavigationError ||
        event instanceof NavigationSkipped
      )
    ) {
      return;
    }

    const success = router.lastSuccessfulNavigation();

    // Publication required no success, so a success now is the commit the seed is handed over
    // to, even when a later navigation's outcome arrives first: Angular records the success
    // before emitting its NavigationEnd, and a listener that navigates on it delivers that
    // navigation's synchronous outcome to later listeners before the NavigationEnd.
    if (untracked(this.#state).kind === "published" && success !== null) {
      this.settle({ kind: "handedOver", navigation: success.id });

      return;
    }

    // Retired, or it committed before a seed existed.
    this.settle(retired);
  }
}

const CONTROL = new InjectionToken<SeedControl>("@loozo/angular-router active-route seed control");

/** The active-route seed of this application, when it installs provideActiveRouteHydration(). */
export const SEED = new InjectionToken<SeedContext>("@loozo/angular-router active-route seed");

/**
 * Lets `injectActiveRoute()` read the server's active route on a server-rendered, hydrated
 * page until the browser's first navigation reaches its outcome, instead of `undefined`.
 * Install it in the application config shared by the server and the browser.
 *
 * @remarks
 * The server sends its committed generated chain in TransferState. Before the root component
 * exists, the browser loads that chain's children tables and parses the chain's params and
 * search from its own URL with the genuine codecs; resolver data and titles are the server's.
 * The seed is dropped at the first navigation outcome other than a redirect or a superseding
 * navigation. Without a usable seed, readers behave as without the provider.
 */
export function provideActiveRouteHydration(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CONTROL, useFactory: () => new SeedControl() },
    { provide: SEED, useExisting: CONTROL },
    // Runs before every app initializer, so outcomes of navigations they request are seen.
    provideEnvironmentInitializer(() => {
      const transferState = inject(TransferState);

      if (isPlatformServer(inject(PLATFORM_ID))) {
        const router = inject(Router);

        // Sampled when Angular serializes TransferState, after the page is stable.
        transferState.onSerialize(KEY, () => capture(router));

        return;
      }

      const seed = transferState.get(KEY, null);

      if (seed === null) {
        return;
      }

      transferState.remove(KEY);

      const control = inject(CONTROL);

      control.settle({ kind: "waiting", seed });
      control.observe(inject(Router), inject(DestroyRef));
    }),
    provideAppInitializer(() => {
      const control = inject(CONTROL);
      const current = untracked(control.state);

      // No key, or an outcome already retired it.
      if (current.kind !== "waiting") {
        return;
      }

      return publish(control, current.seed, inject(Router), inject(Location));
    }),
  ]);
}

/** The committed generated chain, or undefined when there is none or it can't be sent. */
function capture(router: Router): ActiveRouteSeed | undefined {
  const success = router.lastSuccessfulNavigation();
  const live = committedChain(router, success);

  if (!success?.finalUrl || !live) {
    return undefined;
  }

  const routes: SeededRoute[] = [];
  let consumed = 0;

  for (const activated of live) {
    const snapshot = activated.snapshot;
    const from = consumed;

    // Native wrappers consume segments too.
    consumed += snapshot.url.length;

    const config = activated.routeConfig;
    const facts = recordFacts(config);

    if (!facts) {
      continue;
    }

    const id = destinationRecord(facts.destination).id;
    const keys = resolverKeys(config);
    let data: Record<string, unknown> | undefined;

    if (keys.length > 0) {
      data = Object.create(null) as Record<string, unknown>;

      for (const key of keys) {
        if (typeof key !== "string") {
          untransferable(id, key);

          return undefined;
        }

        if (!Object.hasOwn(snapshot.data, key)) {
          continue;
        }

        const value = snapshot.data[key];

        if (!transferable(value, [])) {
          untransferable(id, key);

          return undefined;
        }

        data[key] = value;
      }
    }

    let title: string | undefined;

    if (config?.title !== undefined) {
      title = snapshot.title;
    }

    routes.push({ id, from, to: consumed, data, title });
  }

  if (routes.length === 0) {
    return undefined;
  }

  const url = router.serializeUrl(new UrlTree(success.finalUrl.root, success.finalUrl.queryParams));

  return { url, routes };
}

function untransferable(id: string, key: PropertyKey): void {
  if (isDevMode()) {
    console.warn(
      `@loozo/angular-router: active route not seeded (resolver ${String(key)} of ${id} returned a value JSON can't carry unchanged)`,
    );
  }
}

/**
 * Whether JSON carries the value unchanged: null, booleans, strings, finite numbers other
 * than -0, and plain arrays and objects of those, with only enumerable data properties.
 * `ancestors` holds the objects being visited, so a cycle fails while a value reached twice
 * through different paths passes (and arrives as two equal copies).
 */
function transferable(value: unknown, ancestors: object[]): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0);
  }

  if (typeof value !== "object" || ancestors.includes(value)) {
    return false;
  }

  const keys = Reflect.ownKeys(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  let members: readonly PropertyKey[];

  if (Array.isArray(value)) {
    // Every index 0…n-1 plus length and nothing else: no holes, no extra keys.
    if (prototype !== Array.prototype || keys.length !== value.length + 1) {
      return false;
    }

    const indices: string[] = [];

    for (let index = 0; index < value.length; index += 1) {
      indices.push(String(index));
    }

    members = indices;
  } else {
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }

    members = keys;
  }

  ancestors.push(value);

  let accepted = true;

  for (const key of members) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (
      typeof key !== "string" ||
      !descriptor?.enumerable ||
      !("value" in descriptor) ||
      !transferable(descriptor.value, ancestors)
    ) {
      accepted = false;

      break;
    }
  }

  ancestors.pop();

  return accepted;
}

/** Why a seed isn't used; the message is the reason the dev-mode warning names. */
class NotSeeded extends Error {}

/**
 * Checks the seed against the browser URL, loads its records' children tables and publishes
 * the chain. It never rejects: any failure retires the seed.
 */
async function publish(
  control: SeedControl,
  seed: ActiveRouteSeed,
  router: Router,
  location: Location,
): Promise<void> {
  try {
    const initial = browserUrl(router, location);

    if (initial.url !== seed.url) {
      throw new NotSeeded("URL changed");
    }

    const segments = primarySegments(initial.tree);

    checkRanges(seed.routes, segments.length);

    const records = await seededRecords(seed.routes, router.config);

    // A navigation outcome during the loads already retired it.
    if (untracked(control.state).kind !== "waiting") {
      return;
    }

    if (router.lastSuccessfulNavigation() !== null) {
      control.settle(retired);

      return;
    }

    const current = browserUrl(router, location);

    if (current.url !== seed.url) {
      throw new NotSeeded("URL changed");
    }

    control.settle({ kind: "published", chain: seededChain(seed.routes, records, current.tree) });
  } catch (error) {
    control.settle(retired);

    if (isDevMode()) {
      let reason = String(error);

      if (error instanceof NotSeeded) {
        reason = error.message;
      }

      console.warn(`@loozo/angular-router: active route not seeded (${reason})`);
    }
  }
}

/** The URL Angular's initial navigation reads, and its serialization without the fragment. */
function browserUrl(router: Router, location: Location): { tree: UrlTree; url: string } {
  const tree = router.parseUrl(location.path(true));
  const url = router.serializeUrl(new UrlTree(tree.root, tree.queryParams));

  return { tree, url };
}

function primarySegments(tree: UrlTree): UrlSegment[] {
  const segments: UrlSegment[] = [];

  for (
    let group = tree.root.children[PRIMARY_OUTLET];
    group !== undefined;
    group = group.children[PRIMARY_OUTLET]
  ) {
    segments.push(...group.segments);
  }

  return segments;
}

function checkRanges(routes: readonly SeededRoute[], length: number): void {
  if (routes.length === 0) {
    throw new NotSeeded("invalid segment range");
  }

  let previous = 0;

  for (const { from, to } of routes) {
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < previous ||
      to < from ||
      to > length
    ) {
      throw new NotSeeded("invalid segment range");
    }

    previous = to;
  }
}

interface Found {
  readonly record: Route;
  readonly destination: Destination<AnyRoute>;
}

/**
 * Each seeded record, found by id from the router's configuration down, loading the
 * children table of every record but the last through its generated loader. The ES module
 * map hands Angular the same table when its navigation loads it.
 */
async function seededRecords(routes: readonly SeededRoute[], config: Routes): Promise<Found[]> {
  const found: Found[] = [];
  let candidates = config;

  for (let index = 0; index < routes.length; index += 1) {
    const match = findRecord(candidates, routes[index].id);

    if (match === undefined) {
      throw new NotSeeded(`unknown route ${routes[index].id}`);
    }

    found.push(match);

    const next = routes[index + 1];

    if (next === undefined) {
      break;
    }

    if (match.record.loadChildren === undefined) {
      throw new NotSeeded(`unknown route ${next.id}`);
    }

    candidates = await loadChildren(match.record.loadChildren);
  }

  return found;
}

/**
 * The first generated record with that id, depth-first. A generated record with another id
 * isn't descended into, and native lazy branches are neither loaded nor searched.
 */
function findRecord(routes: Routes, id: string): Found | undefined {
  for (const record of routes) {
    const facts = recordFacts(record);

    if (facts) {
      if (destinationRecord(facts.destination).id === id) {
        return { record, destination: facts.destination };
      }

      continue;
    }

    if (record.children) {
      const found = findRecord(record.children, id);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

// Generated loaders are plain imports, so they need no injection context.
async function loadChildren(load: LoadChildren): Promise<Routes> {
  let loaded: unknown;

  try {
    loaded = await load();
  } catch (error) {
    throw new NotSeeded(`children failed to load: ${String(error)}`);
  }

  if (!Array.isArray(loaded)) {
    throw new NotSeeded("children failed to load: not a route array");
  }

  return loaded;
}

/** Plain snapshots of the seeded records over the browser URL, each parsed once to check it. */
function seededChain(
  routes: readonly SeededRoute[],
  records: readonly Found[],
  tree: UrlTree,
): SeededChain {
  const segments = primarySegments(tree);
  const queryParamMap = tree.queryParamMap;
  const snapshots: SnapshotLike[] = [];
  const chain: SeededRecord[] = [];

  for (let index = 0; index < routes.length; index += 1) {
    const { from, to, data = {}, title } = routes[index];
    const { record, destination } = records[index];
    const pathFromRoot: SnapshotLike[] = [...snapshots];
    const snapshot: SnapshotLike = {
      routeConfig: record,
      url: segments.slice(from, to),
      queryParamMap,
      data,
      title,
      pathFromRoot,
    };

    pathFromRoot.push(snapshot);
    snapshots.push(snapshot);

    // The server matched this URL with the same codecs, so only a nondeterministic codec
    // fails here; a failure gives no seed instead of a reader that throws.
    try {
      parseInputs(destination, snapshot);
    } catch (error) {
      throw new NotSeeded(`inputs failed to parse: ${String(error)}`);
    }

    chain.push(Object.freeze({ record, snapshot }));
  }

  return Object.freeze(chain);
}

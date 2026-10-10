import {
  DestroyRef,
  PendingTasks,
  inject,
  resourceFromSnapshots,
  signal,
  type ResourceSnapshot,
} from "@angular/core";
import {
  ActivatedRoute,
  Router,
  NavigationStart,
  NavigationEnd,
  NavigationCancel,
  NavigationSkipped,
  NavigationError,
  NavigationCancellationCode,
  type ActivatedRouteSnapshot,
} from "@angular/router";
import { routeMetadata } from "@loozo/angular-router/_core";
import {
  assertIdentity,
  fullOperation,
  type Operation,
  type Parsed,
  type RouteSet,
} from "./inputs.js";

// Shared parsing has no view/task lifetime. Each handle owns its visibility and relevance.
export function observeRoute(set: RouteSet, id: string) {
  const activated = inject(ActivatedRoute);
  const router = inject(Router);
  const destroy = inject(DestroyRef);
  const tasks = inject(PendingTasks);

  assertIdentity(activated.snapshot, id);

  const paired = signal<ResourceSnapshot<Parsed | undefined>>({
    status: "loading",
    value: undefined,
  });
  const data = signal<ResourceSnapshot<Readonly<Record<PropertyKey, unknown>> | undefined>>({
    status: "loading",
    value: undefined,
  });
  let survivor: ActivatedRouteSnapshot | undefined;
  let work: Operation | undefined;
  let commitment = -1;
  let pending: number | undefined;
  let visible = false;
  let destroyed = false;
  let release: (() => void) | undefined;
  let acquiring = false;

  function track(): void {
    if (release || destroyed || acquiring) {
      return;
    }

    // Native add synchronously notifies stability observers before returning ownership.
    acquiring = true;

    const cleanup = tasks.add();

    acquiring = false;

    if (destroyed) {
      cleanup();

      return;
    }

    release = cleanup;
  }

  function untrack(): void {
    const cleanup = release;

    release = undefined;
    cleanup?.();
  }

  function publish(): void {
    if (!visible || destroyed || !work) {
      return;
    }

    if (!work.outcome) {
      paired.set({ status: "loading", value: undefined });
      track();

      return;
    }

    if ("value" in work.outcome) {
      paired.set({ status: "resolved", value: work.outcome.value });
    } else {
      paired.set({ status: "error", error: work.outcome.error });
    }

    // A synchronous paired write always precedes package task removal.
    untrack();
  }

  function adopt(snapshot: ActivatedRouteSnapshot): void {
    assertIdentity(snapshot, id);

    if (snapshot === survivor) {
      return;
    }

    survivor = snapshot;

    const joined = fullOperation(set, id, snapshot);

    work = joined;

    if (!joined.outcome) {
      track();
    }

    joined.promise.then(
      () => {
        if (work === joined) {
          publish();
        }
      },
      () => {
        if (work === joined) {
          publish();
        }
      },
    );
  }

  function reconcile(): void {
    const successful = router.lastSuccessfulNavigation();

    if (successful && successful.id > commitment) {
      commitment = successful.id;
      adopt(activated.snapshot);
    }
  }

  function restore(): void {
    if (destroyed) {
      return;
    }

    reconcile();

    if (!survivor) {
      adopt(activated.snapshot);
    }

    const local: Record<PropertyKey, unknown> = Object.create(null);
    const resolvers = routeMetadata(set.records[id].definition()).config.resolve ?? {};

    for (const key of Reflect.ownKeys(resolvers)) {
      if (Object.hasOwn(survivor!.data, key)) {
        local[key] = survivor!.data[key];
      }
    }

    data.set({ status: "resolved", value: Object.freeze(local) });
    visible = true;
    publish();
  }

  function idleHandoff(): void {
    queueMicrotask(() => {
      if (destroyed || visible) {
        return;
      }

      const current = router.currentNavigation();
      const successful = router.lastSuccessfulNavigation();

      if (!current || current.id === successful?.id) {
        pending = undefined;
        restore();
      }
    });
  }

  function eligible(id: number): boolean {
    const current = router.currentNavigation();
    const successful = router.lastSuccessfulNavigation();

    if (current && current.id > id && current.id !== successful?.id) {
      return false;
    }

    return pending === undefined || pending === id;
  }

  // Subscribe before reading native phase: constructors can run inside event delivery.
  const subscription = router.events.subscribe((event) => {
    if (destroyed) {
      return;
    }

    if (event instanceof NavigationStart) {
      pending = event.id;
      visible = false;
      reconcile();
      paired.set({ status: "loading", value: undefined });
      data.set({ status: "loading", value: undefined });
    } else if (event instanceof NavigationEnd) {
      // Even an old End may expose a newer true survivor; it cannot settle a newer Start.
      reconcile();

      if (eligible(event.id)) {
        pending = undefined;
        restore();
      }
    } else if (event instanceof NavigationCancel) {
      reconcile();

      if (
        event.code === NavigationCancellationCode.Redirect ||
        event.code === NavigationCancellationCode.SupersededByNewNavigation
      ) {
        return;
      }

      if (eligible(event.id)) {
        pending = undefined;
        restore();
      }
    } else if (event instanceof NavigationSkipped) {
      reconcile();

      if (eligible(event.id)) {
        pending = undefined;
        restore();
      }
    } else if (event instanceof NavigationError && eligible(event.id)) {
      reconcile();
      pending = undefined;
      visible = false;

      let error = event.error;

      if (!(error instanceof Error)) {
        error = new Error("Navigation failure", { cause: event.error });
      }

      paired.set({ status: "error", error });
      data.set({ status: "error", error });
      untrack();
    }
  });

  destroy.onDestroy(() => {
    destroyed = true;
    visible = false;
    subscription.unsubscribe();
    untrack();
  });

  // Synchronous task handoff prevents whenStable resolving before a missed-terminal microtask.
  track();

  if (!destroyed) {
    const current = router.currentNavigation();
    const successful = router.lastSuccessfulNavigation();

    if (!current || current.id === successful?.id) {
      restore();
    } else {
      pending = current.id;
      idleHandoff();
    }
  }

  function project(key: "params" | "search"): ResourceSnapshot<any> {
    const state = paired();

    if (state.status === "error") {
      return state;
    }

    return { status: state.status, value: state.value?.[key] };
  }

  return {
    params: resourceFromSnapshots(() => project("params")),
    search: resourceFromSnapshots(() => project("search")),
    data: resourceFromSnapshots(() => data()),
  };
}

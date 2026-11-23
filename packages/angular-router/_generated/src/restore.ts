import { inject } from "@angular/core";
import { RedirectCommand, Router, UrlTree, type RouterStateSnapshot } from "@angular/router";
import { isArrayCodec } from "@loozo/angular-router/_core";
import { deepestDestination, stateOwners } from "./base.js";
import { rememberedKeys, storedValues } from "./remembered.js";
import { SEARCH_STORE, type SearchStore } from "./search-store.js";

/**
 * Restores the remembered keys a navigation enters without: the first thing every resolver and
 * dynamic-title adapter of a generated primary record calls. Synchronous, and decided once per
 * navigation.
 *
 * @remarks
 * Angular runs it only once every guard of the whole target tree accepted, and its
 * synchronously returned `RedirectCommand` stops resolution before any later resolver or title
 * is called. The navigation enters an owner when the target's deepest generated primary
 * record is inside it and the router's current state isn't. For each entered owner's
 * remembered key the URL lacks and its chain hasn't read yet, a stored value that reads
 * as present and valid is collected and an invalid one is forgotten; all collected keys go
 * into one redirect to the same URL, which keeps the navigation's `state`.
 *
 * @returns `true` to let the callback run, or the restore's redirect.
 * @throws Error when the target has a remembered key and the application has no storage.
 */
export function restoreGate(state: RouterStateSnapshot): true | RedirectCommand {
  const keys = rememberedKeys(deepestDestination(state.root));

  if (keys.length === 0) {
    return true;
  }

  const store = inject(SEARCH_STORE, { optional: true });

  if (store === null) {
    throw new Error(`Remembered search keys need provideSearchStorage(): ${keys[0].id}`);
  }

  const router = inject(Router);
  const id = router.currentNavigation()!.id;

  if (store.decided?.id === id) {
    return store.decided.result;
  }

  const result = restore(store, router, state, keys);

  store.decided = { id, result };

  return result;
}

function restore(
  store: SearchStore,
  router: Router,
  state: RouterStateSnapshot,
  keys: ReturnType<typeof rememberedKeys>,
): true | RedirectCommand {
  // During resolution the router's state is still the one being left.
  const current = stateOwners(router.routerState.snapshot.root);
  const chain = store.chain!;
  const query = state.root.queryParamMap;
  // No prototype: a key named like an inherited setter (`__proto__`) stays an own key.
  const restored: Record<string, string | readonly string[]> = Object.create(null);
  let collected = false;

  for (const { key, codec, id, owner } of keys) {
    if (current.has(owner) || query.has(key) || chain.read.has(id)) {
      continue;
    }

    chain.read.add(id);

    const text = store.storage.read(id);

    if (text === undefined) {
      continue;
    }

    const raws = storedValues(codec, text);

    if (raws === undefined) {
      store.storage.forget(id);

      continue;
    }

    chain.ids.add(id);
    collected = true;

    if (isArrayCodec(codec)) {
      restored[key] = raws;
    } else {
      restored[key] = raws[0];
    }
  }

  if (!collected) {
    return true;
  }

  chain.originalUrl ??= state.url;

  // A fresh tree: the parsed one caches its queryParamMap. Spreading defines own keys.
  const parsed = router.parseUrl(state.url);
  const target = new UrlTree(parsed.root, { ...parsed.queryParams, ...restored }, parsed.fragment);

  return new RedirectCommand(target, { state: router.currentNavigation()?.extras.state });
}

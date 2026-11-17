import type { ActivatedRoute, ActivatedRouteSnapshot, Navigation, Router } from "@angular/router";

/**
 * The live primary chain, root first, when it is the committed tree; otherwise undefined.
 *
 * @remarks
 * Angular replaces the router state and advances each route's snapshot during
 * activation, before the navigation succeeds. The tree is committed when every live
 * route holds the state's snapshot at its depth, and either no navigation runs or the
 * state is the last successful navigation's final URL.
 */
export function committedChain(
  router: Router,
  success: Navigation | null,
): ActivatedRoute[] | undefined {
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

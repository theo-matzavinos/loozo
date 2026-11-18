import {
  PRIMARY_OUTLET,
  type ActivatedRoute,
  type ActivatedRouteSnapshot,
  type Navigation,
  type Router,
} from "@angular/router";

/**
 * The live primary chain, root first, when it is the committed tree; otherwise undefined.
 *
 * @remarks
 * The chain follows the primary child at each level, never a named outlet's.
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
    route = primaryChild(route.children);
    snapshot = primaryChild(snapshot.children);
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

function primaryChild<Node extends { readonly outlet: string }>(
  children: readonly Node[],
): Node | null {
  for (const child of children) {
    if (child.outlet === PRIMARY_OUTLET) {
      return child;
    }
  }

  return null;
}

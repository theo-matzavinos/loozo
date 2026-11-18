import { PLATFORM_ID, inject } from "@angular/core";
import { Location, isPlatformServer } from "@angular/common";
import { Router, UrlTree } from "@angular/router";

/**
 * The URL typed navigation composes with, as a function that injects nothing.
 *
 * @remarks
 * Call it once in an injection context; the returned function reads the router at each
 * call. In the browser, before the first successful navigation, that's the browser URL,
 * which Angular's initial navigation reads; otherwise it's the router state's URL. Each
 * call reads `lastSuccessfulNavigation()`, so template and `computed` callers re-run after
 * every success.
 */
export function injectNavigationBase(): () => UrlTree {
  const router = inject(Router);
  const location = inject(Location);
  const server = isPlatformServer(inject(PLATFORM_ID));

  return () => {
    const success = router.lastSuccessfulNavigation();

    if (success === null && !server) {
      return browserUrl(router, location).tree;
    }

    return router.parseUrl(router.routerState.snapshot.url);
  };
}

/** The URL Angular's initial navigation reads, and its serialization without the fragment. */
export function browserUrl(router: Router, location: Location): { tree: UrlTree; url: string } {
  const tree = router.parseUrl(location.path(true));
  const url = router.serializeUrl(new UrlTree(tree.root, tree.queryParams));

  return { tree, url };
}

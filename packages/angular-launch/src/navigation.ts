import { inject, RESPONSE_INIT } from "@angular/core";
import { RedirectCommand, Router, type NavigationError } from "@angular/router";
import { currentSearchRestore } from "@loozo/angular-router/_generated";
import { RpcNotFound, RpcRedirect } from "./outcomes.js";

/** Options for {@link rpcNavigationErrors}. */
export interface RpcNavigationErrorsOptions {
  /**
   * The root-relative URL of the app's not-found page, such as `createUrl(notFound, {})`
   * with the not-found route's generated `destination`. It's rendered at the requested URL.
   */
  readonly notFound: `/${string}`;
}

/**
 * Creates a navigation error handler that follows RPC redirects and renders not-found
 * outcomes.
 *
 * @remarks
 * Pass it to Angular's `withNavigationErrorHandler`. When a guard or resolver fails with
 * an {@link RpcRedirect}, the navigation goes to its `to` instead; during server
 * rendering Angular then answers the page request with a 302. When it fails with an
 * {@link RpcNotFound}, the navigation renders `notFound` while the address bar keeps the
 * requested URL; during server rendering the page is answered with status 404. Any other
 * error is left to Angular, which fails the navigation as usual.
 *
 * When the navigation restored a remembered search value (`remembered` from
 * `@loozo/angular-router`), the not-found may be that value's fault, such as a filter that no
 * longer exists. The handler then forgets the values the navigation restored and navigates
 * again to the URL from before the restore, keeping the navigation's `state`, so the page
 * renders with its fallbacks: during server rendering, with status 200 and the cookies'
 * deletion. It does this once per navigation; a page that is missing anyway fails again and
 * gets the not-found page. A redirect keeps remembered values.
 *
 * Angular takes one navigation error handler. An app with its own calls this one from it,
 * within the handler's injection context, and returns its result.
 *
 * @example
 * ```ts
 * provideRouter(
 *   routes,
 *   withNavigationErrorHandler(rpcNavigationErrors({ notFound: createUrl(notFound, {}) })),
 * );
 * ```
 *
 * @param options - The not-found page's URL.
 * @returns The handler, which must run in an injection context.
 */
export function rpcNavigationErrors({
  notFound,
}: RpcNavigationErrorsOptions): (error: NavigationError) => RedirectCommand | undefined {
  return (error) => {
    const router = inject(Router);
    const cause: unknown = error.error;

    if (cause instanceof RpcRedirect) {
      return new RedirectCommand(router.parseUrl(cause.to));
    }

    if (!(cause instanceof RpcNotFound)) {
      return undefined;
    }

    // Before any status: a page that renders with its fallbacks answers 200.
    const restore = currentSearchRestore();

    if (restore !== undefined) {
      restore.forget();

      return new RedirectCommand(router.parseUrl(restore.originalUrl), {
        state: router.currentNavigation()?.extras.state,
      });
    }

    // Angular builds the page response from this object once the app is stable.
    const response = inject(RESPONSE_INIT, { optional: true });

    if (response !== null) {
      response.status = 404;
    }

    return new RedirectCommand(router.parseUrl(notFound), { browserUrl: error.url });
  };
}

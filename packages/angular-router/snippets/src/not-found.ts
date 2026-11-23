import { RESPONSE_INIT, inject } from "@angular/core";
import { RedirectCommand, Router, type NavigationError } from "@angular/router";
import { currentSearchRestore } from "../generated/routes.generated.js";
import { MissingResource } from "./missing-resource.js";

/** Renders the not-found page for missing data, after one retry without restored values. */
export function notFoundErrors(error: NavigationError): RedirectCommand | undefined {
  if (!(error.error instanceof MissingResource)) {
    return undefined;
  }

  const router = inject(Router);
  // Before setting a status: a recovered page answers 200.
  const restore = currentSearchRestore();

  if (restore !== undefined) {
    restore.forget();

    return new RedirectCommand(router.parseUrl(restore.originalUrl), {
      state: router.currentNavigation()?.extras.state,
    });
  }

  const response = inject(RESPONSE_INIT, { optional: true });

  if (response !== null) {
    response.status = 404;
  }

  return new RedirectCommand(router.parseUrl("/not-found"), { browserUrl: error.url });
}

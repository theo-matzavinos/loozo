import { InjectionToken, inject, type Signal } from "@angular/core";
import { RedirectCommand, Router } from "@angular/router";
import { createUrl } from "@loozo/angular-router";
import type { PackageContent } from "../generated/content/model.generated.js";
import notFound from "./routes/not-found/definition.js";

/**
 * The content of the package the package layout shows, for the pages inside it. The package route
 * resolves it before those pages activate, so it's there when they first render.
 */
export const CurrentPackage = new InjectionToken<Signal<PackageContent>>("CurrentPackage");

/**
 * Shows the not-found page while the address bar keeps `browserUrl`, for a guard whose package has
 * no such entry. The not-found route renders /404, which the package route can't match, so the
 * redirect can't come back to that guard. Call it where inject works: at the start of the guard,
 * before any await.
 */
export function notFoundRedirect(browserUrl: string): RedirectCommand {
  const url = inject(Router).parseUrl(createUrl(notFound, { params: { segments: ["404"] } }));

  return new RedirectCommand(url, { browserUrl });
}

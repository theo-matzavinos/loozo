import { InjectionToken, inject, type Signal } from "@angular/core";
import { RedirectCommand, Router } from "@angular/router";
import { createUrl } from "@loozo/angular-router";
import type { GuidePage, PackageContent } from "../generated/content/model.generated.js";
import notFound from "./routes/$segments[]/route.js";

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

/**
 * The guide page with `slug`, and the pages its previous and next links move through: the README's
 * H2 sections, or the entry-point guides in entry-point order.
 */
export function findGuide(
  content: PackageContent,
  slug: string,
): { guide: GuidePage; sequence: readonly GuidePage[] } | undefined {
  const entryPointGuides: GuidePage[] = [];

  for (const entryPoint of content.entryPoints) {
    if (entryPoint.guide !== null) {
      entryPointGuides.push(entryPoint.guide);
    }
  }

  for (const sequence of [content.guides, entryPointGuides]) {
    for (const guide of sequence) {
      if (guide.slug === slug) {
        return { guide, sequence };
      }
    }
  }

  return undefined;
}

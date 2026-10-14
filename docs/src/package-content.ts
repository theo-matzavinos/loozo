import { InjectionToken, type Signal } from "@angular/core";
import { loadPackage, packageSlugs } from "../generated/content/index.generated.js";
import type { PackageContent } from "../generated/content/model.generated.js";

/** The package route's resolver: the package named by the URL, or null when there's no such package. */
export async function resolvePackage(slug: string) {
  for (const candidate of packageSlugs) {
    if (candidate === slug) {
      return loadPackage(candidate);
    }
  }

  return null;
}

/**
 * The content of the package the package layout shows, for the pages inside it. The package route
 * resolves it before those pages activate, so it's there when they first render. It's undefined
 * while a navigation is in progress and null when the URL names no package.
 */
export const CurrentPackage = new InjectionToken<Signal<PackageContent | null | undefined>>(
  "CurrentPackage",
);

import { DOCUMENT } from "@angular/common";
import { effect, inject } from "@angular/core";
import { injectActiveRoute } from "../generated/routes.generated.js";
import { destination as notFound } from "./routes/$segments[]/destination.generated.js";

// The public origin. Not the request's: prerendering has none, and a proxy can rewrite it.
const origin = "https://www.example.com";

/** Keeps <link rel="alternate" hreflang> in <head> in step with the active route. */
export function injectAlternates(): void {
  const document = inject(DOCUMENT);
  const active = injectActiveRoute();

  effect(() => {
    const route = active();

    // Only the links this function made: an RSS or other alternate link stays.
    for (const link of document.head.querySelectorAll("link[data-hreflang]")) {
      link.remove();
    }

    if (!route || route.is(notFound)) {
      return;
    }

    const urls = route.localeUrls();
    const entries = [...urls];

    if (urls.length > 0) {
      // The source locale comes first.
      entries.push({ locale: "x-default", url: urls[0].url });
    }

    for (const { locale, url } of entries) {
      const link = document.createElement("link");

      link.rel = "alternate";
      link.hreflang = locale;
      // Keeps an absolute base href's own origin.
      link.href = new URL(url, origin).href;
      link.setAttribute("data-hreflang", "");
      // appendChild, not append: Angular's server DOM has no append.
      document.head.appendChild(link);
    }
  });
}

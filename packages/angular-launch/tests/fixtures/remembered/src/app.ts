import { isPlatformBrowser } from "@angular/common";
import { Component, inject, PLATFORM_ID } from "@angular/core";
import { Router, RouterOutlet, type NavigationBehaviorOptions } from "@angular/router";
import { injectActiveRoute } from "../generated/routes.generated";
import { destination as cached } from "./routes/cached/destination.generated";
import { destination as missing } from "./routes/missing/destination.generated";
import { destination as orders } from "./routes/orders/destination.generated";
import { Trace, type TraceEntry } from "./trace";

interface ActiveRead {
  readonly owner: string | null;
  readonly search: unknown;
}

declare global {
  // Browser only: what the proof reads and drives. No UI.
  var proof:
    | {
        // The shell's first active-route read, before any navigation succeeded.
        readonly first: ActiveRead & { readonly beforeFirstSuccess: boolean };
        readonly trace: TraceEntry[];
        readonly active: () => ActiveRead;
        readonly idle: () => boolean;
        readonly navigate: (url: string, extras?: NavigationBehaviorOptions) => Promise<boolean>;
      }
    | undefined;
}

@Component({ selector: "launch-root", imports: [RouterOutlet], template: `<router-outlet />` })
export class App {
  constructor() {
    const router = inject(Router);
    const active = injectActiveRoute();
    const owned = [
      ["orders", orders],
      ["cached", cached],
      ["missing", missing],
    ] as const;

    function read(): ActiveRead {
      const route = active();

      if (route === undefined) {
        return { owner: null, search: null };
      }

      for (const [name, destination] of owned) {
        if (route.is(destination)) {
          return { owner: name, search: route.search() };
        }
      }

      return { owner: "other", search: route.search() };
    }

    const first = { ...read(), beforeFirstSuccess: router.lastSuccessfulNavigation() === null };

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      globalThis.proof = {
        first,
        trace: inject(Trace).entries,
        active: read,
        idle: () =>
          router.lastSuccessfulNavigation() !== null && router.currentNavigation() === null,
        navigate: (url, extras) => router.navigateByUrl(url, extras),
      };
    }
  }
}

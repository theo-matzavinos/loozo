import { isPlatformBrowser } from "@angular/common";
import {
  APP_BOOTSTRAP_LISTENER,
  ApplicationRef,
  inject,
  makeEnvironmentProviders,
  PLATFORM_ID,
} from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";
import { launchQueries } from "../launch-queries.js";
import { createQueries } from "./create-queries.js";
import { hydrationWindow } from "./hydration-window.js";

/**
 * Provides what route handles' `queries` need: the TanStack factories and the app's
 * hydration window.
 *
 * @remarks
 * Add it to the application's providers next to TanStack's `provideTanStackQuery(...)`,
 * not to a route or component. Reading `route.queries` throws without it.
 *
 * In the browser, query options don't refetch on mount while the app hydrates,
 * from bootstrap until the app is first stable, so data dehydrated during server rendering
 * is used as is even with `staleTime: 0`. After that, `refetchOnMount` follows your
 * `QueryClient` defaults. This is the same window Angular's HTTP transfer cache uses.
 * The window also opens in a browser app without server rendering: queries without data
 * still load, but ones with `initialData` or already in the cache don't refetch on mount
 * until the app is first stable.
 *
 * @example
 * ```ts
 * import { provideTanStackQuery, QueryClient } from "@tanstack/angular-query";
 * import { provideLaunchQueries } from "@loozo/angular-launch/tanstack-query";
 *
 * export const config: ApplicationConfig = {
 *   providers: [
 *     provideHttpClient(),
 *     provideClientHydration(),
 *     provideRouter(routes),
 *     provideTanStackQuery(() => new QueryClient()),
 *     provideLaunchQueries(),
 *   ],
 * };
 * ```
 *
 * @returns The providers for the application's root environment injector.
 */
export function provideLaunchQueries(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: launchQueries, useValue: createQueries },
    {
      provide: hydrationWindow,
      useFactory: () => ({ open: isPlatformBrowser(inject(PLATFORM_ID)) }),
    },
    {
      // Angular's HTTP transfer cache waits from the same hook. Waiting from a provider
      // factory or an environment initializer resolves before bootstrap registers any
      // pending work, so the window would close before the first page mounts.
      provide: APP_BOOTSTRAP_LISTENER,
      multi: true,
      useFactory: () => {
        const hydration = inject(hydrationWindow);
        const app = inject(ApplicationRef);

        return () => {
          if (!hydration.open) {
            return;
          }

          void app.whenStable().then(() => {
            hydration.open = false;
          });
        };
      },
    },
  ]);
}

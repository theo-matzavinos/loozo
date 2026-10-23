import { isPlatformBrowser } from "@angular/common";
import {
  APP_BOOTSTRAP_LISTENER,
  ApplicationRef,
  inject,
  InjectionToken,
  makeEnvironmentProviders,
  PLATFORM_ID,
} from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";

/**
 * Whether the app is still hydrating: open in the browser from bootstrap until the app is
 * first stable, never open on the server.
 *
 * @remarks
 * Internal; provided by {@link provideLaunchQueries} and read by generated query options.
 */
export const hydrationWindow = new InjectionToken<{ open: boolean }>("Launch hydration window");

/**
 * Provides what generated `injectQueries()` functions need: the app's hydration window.
 *
 * @remarks
 * Add it to the application's providers next to TanStack's `provideTanStackQuery(...)`,
 * not to a route or component. `injectQueries()` throws without it.
 *
 * In the browser, generated query options don't refetch on mount while the app hydrates,
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

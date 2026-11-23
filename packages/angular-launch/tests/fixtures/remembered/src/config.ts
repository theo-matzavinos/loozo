import { inject, provideEnvironmentInitializer, type ApplicationConfig } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  provideRouter,
  Router,
  withNavigationErrorHandler,
} from "@angular/router";
import { rpcNavigationErrors, searchCookies } from "@loozo/angular-launch";
import { createUrl } from "@loozo/angular-router";
import {
  provideActiveRouteHydration,
  provideSearchStorage,
  routes,
} from "../generated/routes.generated";
import { destination as notFound } from "./routes/not-found/destination.generated";
import { Trace } from "./trace";

const navigationErrors = rpcNavigationErrors({ notFound: createUrl(notFound, {}) });

export const config: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideActiveRouteHydration(),
    provideRouter(
      routes,
      // Launch's handler as shipped, recorded on the way in.
      withNavigationErrorHandler((error) => {
        inject(Trace).add({ kind: "handler", url: error.url, detail: error.error?.name });

        return navigationErrors(error);
      }),
    ),
    provideSearchStorage(searchCookies()),
    provideEnvironmentInitializer(() => {
      const trace = inject(Trace);

      inject(Router).events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          trace.add({ kind: "start", url: event.url });
        } else if (event instanceof NavigationCancel) {
          trace.add({ kind: "cancel", url: event.url, detail: event.code });
        } else if (event instanceof NavigationError) {
          trace.add({ kind: "error", url: event.url });
        } else if (event instanceof NavigationEnd) {
          trace.add({ kind: "end", url: event.urlAfterRedirects });
        }
      });
    }),
  ],
};

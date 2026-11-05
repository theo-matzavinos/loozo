import { provideHttpClient } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter, withNavigationErrorHandler } from "@angular/router";
import type { ApplicationConfig } from "@angular/core";
import { rpcNavigationErrors } from "@loozo/angular-launch";
import { createUrl } from "@loozo/angular-router";
import { provideLaunchQueries } from "@loozo/angular-launch/tanstack-query";
import { provideTanStackQuery, QueryClient } from "@tanstack/angular-query";
import { routes } from "../generated/routes.generated";
import notFound from "./routes/not-found/route";

export const config: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideRouter(
      routes,
      withNavigationErrorHandler(rpcNavigationErrors({ notFound: createUrl(notFound, {}) })),
    ),
    provideTanStackQuery(() => new QueryClient()),
    provideLaunchQueries(),
  ],
};

import type { ApplicationConfig } from "@angular/core";
import { provideHttpClient, withFetch, withInterceptors } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter, withNavigationErrorHandler } from "@angular/router";
import { rpcNavigationErrors } from "@loozo/angular-launch";
import { createUrl } from "@loozo/angular-router";
import { provideRedirectTranslation } from "../generated/redirects.generated";
import { routes } from "../generated/routes.generated";
import { destination as notFound } from "./routes/not-found/destination.generated";
import { recordRedirects } from "./wire";

// Shared by the browser and the server app, so both put RPC redirects in their language.
export const config: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch(), withInterceptors([recordRedirects])),
    provideClientHydration(),
    provideRouter(
      routes,
      withNavigationErrorHandler(rpcNavigationErrors({ notFound: createUrl(notFound, {}) })),
    ),
    provideRedirectTranslation(),
  ],
};

import type { ApplicationConfig } from "@angular/core";
import { provideRouter, withNavigationErrorHandler } from "@angular/router";
import { provideClientHydration, withNoHttpTransferCache } from "@angular/platform-browser";
import {
  provideActiveRouteHydration,
  provideSearchStorage,
  routes,
} from "../generated/routes.generated.js";
import { notFoundErrors } from "./not-found.js";
import { cookieSearchStorage } from "./search-cookies.js";

export const config: ApplicationConfig = {
  providers: [
    provideRouter(routes, withNavigationErrorHandler(notFoundErrors)),
    provideClientHydration(withNoHttpTransferCache()),
    provideActiveRouteHydration(),
    provideSearchStorage(cookieSearchStorage),
  ],
};

import type { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideClientHydration, withNoHttpTransferCache } from "@angular/platform-browser";
import { provideActiveRouteHydration, routes } from "../generated/routes.generated.js";

export const config: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(withNoHttpTransferCache()),
    provideActiveRouteHydration(),
  ],
};

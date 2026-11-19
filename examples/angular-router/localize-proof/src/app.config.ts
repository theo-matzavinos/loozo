import type { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideClientHydration, withNoHttpTransferCache } from "@angular/platform-browser";
import { provideActiveRouteHydration, routes } from "../generated/routes.generated.js";

// provideActiveRouteHydration() keeps the server's switcher and alternates through hydration: the
// active route reads the server's route until the browser's first navigation completes.
export const config: ApplicationConfig = {
  providers: [
    provideActiveRouteHydration(),
    provideRouter(routes),
    provideClientHydration(withNoHttpTransferCache()),
  ],
};

import { type ApplicationConfig } from "@angular/core";
import {
  provideClientHydration,
  withEventReplay,
  withNoIncrementalHydration,
} from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { routes } from "./routes.eager.js";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(withNoIncrementalHydration(), withEventReplay()),
  ],
};

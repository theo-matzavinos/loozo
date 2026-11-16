import { type ApplicationConfig, provideZonelessChangeDetection } from "@angular/core";
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
  withNoIncrementalHydration,
} from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { incremental } from "./mode";
import { routes } from "./routes";

// Angular 22 hydrates incrementally by default; the eager build opts out explicitly.
function hydration() {
  if (incremental) {
    return provideClientHydration(withIncrementalHydration());
  }

  return provideClientHydration(withEventReplay(), withNoIncrementalHydration());
}

export const config: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideRouter(routes), hydration()],
};

import {
  type ApplicationConfig,
  ErrorHandler,
  provideZonelessChangeDetection,
} from "@angular/core";
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
  withNoIncrementalHydration,
} from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { RecordingErrorHandler } from "./error-handler";
import { incremental } from "./mode";
import { routes } from "./routes";

// Angular 22 hydrates incrementally by default; the eager build opts out explicitly.
function hydration() {
  if (incremental) {
    return provideClientHydration(withIncrementalHydration());
  }

  return provideClientHydration(withEventReplay(), withNoIncrementalHydration());
}

/**
 * The fixture's providers. A factory, so `?prod=1` can call `enableProdMode()` first: the
 * hydration providers capture dev mode when they're made.
 */
export function config(): ApplicationConfig {
  return {
    providers: [
      provideZonelessChangeDetection(),
      provideRouter(routes),
      hydration(),
      { provide: ErrorHandler, useClass: RecordingErrorHandler },
    ],
  };
}

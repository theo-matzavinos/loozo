import { type ApplicationConfig } from "@angular/core";
import { provideClientHydration, withNoIncrementalHydration } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { routes } from "./routes";

// Eager hydration with event replay off: the bench sends no input before hydration, so replay would
// only add its own setup to the hydration span.
export const config: ApplicationConfig = {
  providers: [provideRouter(routes), provideClientHydration(withNoIncrementalHydration())],
};

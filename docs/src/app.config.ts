import { isPlatformBrowser } from "@angular/common";
import { type ApplicationConfig, PLATFORM_ID, inject, provideAppInitializer } from "@angular/core";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter, withInMemoryScrolling } from "@angular/router";
import { routes } from "../generated/routes.generated.js";
import { focusNavigatedPages } from "./navigation-focus.js";

export const config: ApplicationConfig = {
  providers: [
    // Anchor scrolling stays disabled: focusNavigatedPages scrolls to fragments itself, because the
    // router's anchor scrolling also focuses the target regardless of the app's focus policy.
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: "enabled" })),
    provideAppInitializer(() => {
      if (!isPlatformBrowser(inject(PLATFORM_ID))) {
        return;
      }

      focusNavigatedPages();
    }),
    provideClientHydration(),
  ],
};

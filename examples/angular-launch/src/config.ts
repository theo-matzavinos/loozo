import { provideHttpClient } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import type { ApplicationConfig } from "@angular/core";
import { routes } from "../generated/routes.generated";

export const config: ApplicationConfig = {
  providers: [provideHttpClient(), provideClientHydration(), provideRouter(routes)],
};

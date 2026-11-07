import { provideHttpClient } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter, withNavigationErrorHandler } from "@angular/router";
import type { ApplicationConfig } from "@angular/core";
import { rpcNavigationErrors } from "@loozo/angular-launch";
import { createUrl } from "@loozo/angular-router";
import { provideLaunchQueries } from "@loozo/angular-launch/tanstack-query";
import { MutationCache, provideTanStackQuery, QueryClient } from "@tanstack/angular-query";
import { routes } from "../generated/routes.generated";
import notFound from "./routes/not-found/route";

export const config: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideClientHydration(),
    provideRouter(
      routes,
      withNavigationErrorHandler(rpcNavigationErrors({ notFound: createUrl(notFound, {}) })),
    ),
    provideTanStackQuery(
      () =>
        new QueryClient({
          mutationCache: new MutationCache({
            // After a write, succeeded or not, read every Launch query on screen again. Wait
            // for the last pending write, so an earlier read doesn't replace a later write's
            // optimistic data. Returning the promise keeps the write pending until the read.
            onSettled: (_data, _error, _input, _result, _mutation, { client }) => {
              if (client.isMutating({ mutationKey: ["launch"] }) > 1) {
                return undefined;
              }

              return client.invalidateQueries({ queryKey: ["launch"] });
            },
          }),
        }),
    ),
    provideLaunchQueries(),
  ],
};

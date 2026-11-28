import { mergeApplicationConfig } from "@angular/core";
import { provideServerRendering, RenderMode, withRoutes } from "@angular/ssr";
import { serverRoutePath } from "@loozo/angular-router";
import { provideLaunchServer } from "../generated/server.generated";
import { config } from "./config";
import { destination as manualsStart } from "./routes/manuals/start/destination.generated";

export const serverConfig = mergeApplicationConfig(config, {
  providers: [
    provideServerRendering(
      withRoutes([
        // Prerendered in each locale's words, so the proof sees the switcher in a static file too.
        { path: serverRoutePath(manualsStart), renderMode: RenderMode.Prerender },
        { path: "**", renderMode: RenderMode.Server },
      ]),
    ),
    provideLaunchServer(),
  ],
});

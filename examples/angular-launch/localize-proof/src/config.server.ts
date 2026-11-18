import { mergeApplicationConfig } from "@angular/core";
import { provideServerRendering, RenderMode, withRoutes } from "@angular/ssr";
import { provideServer } from "../generated/server.generated";
import { config } from "./config";

export const serverConfig = mergeApplicationConfig(config, {
  providers: [
    provideServerRendering(withRoutes([{ path: "**", renderMode: RenderMode.Server }])),
    provideServer(),
  ],
});

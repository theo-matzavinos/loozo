import { mergeApplicationConfig } from "@angular/core";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import { provideServer } from "../generated/server.generated";
import { config } from "./config";
import { rendering } from "./rendering";

export const serverConfig = mergeApplicationConfig(config, {
  providers: [provideServerRendering(withRoutes(rendering)), provideServer()],
});

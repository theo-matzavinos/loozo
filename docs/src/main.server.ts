import { mergeApplicationConfig } from "@angular/core";
import { bootstrapApplication, type BootstrapContext } from "@angular/platform-browser";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import Shell from "./shell.js";
import { config } from "./app.config.js";
import { serverRoutes } from "./server-routes.js";

const server = { providers: [provideServerRendering(withRoutes(serverRoutes))] };

export default (context: BootstrapContext) => {
  return bootstrapApplication(Shell, mergeApplicationConfig(config, server), context);
};

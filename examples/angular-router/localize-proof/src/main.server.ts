import { mergeApplicationConfig } from "@angular/core";
import { bootstrapApplication, type BootstrapContext } from "@angular/platform-browser";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import App from "./app.js";
import { config } from "./app.config.js";
import { serverRoutes } from "./app.routes.server.js";

const server = { providers: [provideServerRendering(withRoutes(serverRoutes))] };

export default (context: BootstrapContext) => {
  return bootstrapApplication(App, mergeApplicationConfig(config, server), context);
};

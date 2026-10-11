import { mergeApplicationConfig } from "@angular/core";
import { bootstrapApplication, type BootstrapContext } from "@angular/platform-browser";
import { provideServerRendering, RenderMode, withRoutes } from "@angular/ssr";
import App from "./app.js";
import { config } from "./app.config.js";

const server = {
  providers: [provideServerRendering(withRoutes([{ path: "**", renderMode: RenderMode.Server }]))],
};

export default (context: BootstrapContext) => {
  return bootstrapApplication(App, mergeApplicationConfig(config, server), context);
};

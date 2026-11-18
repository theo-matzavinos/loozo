import { mergeApplicationConfig } from "@angular/core";
import { bootstrapApplication, type BootstrapContext } from "@angular/platform-browser";
import { provideServerRendering, RenderMode, withRoutes } from "@angular/ssr";
import App from "./app.js";
import { config } from "./app.config.js";

// Angular matches server routes by pathname, so named-outlet URLs reach `**`; the app's root
// catchall gives them a route to render instead of a 404.
const server = {
  providers: [provideServerRendering(withRoutes([{ path: "**", renderMode: RenderMode.Server }]))],
};

export default (context: BootstrapContext) => {
  return bootstrapApplication(App, mergeApplicationConfig(config, server), context);
};

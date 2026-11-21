import { mergeApplicationConfig } from "@angular/core";
import { type BootstrapContext, bootstrapApplication } from "@angular/platform-browser";
import { RenderMode, provideServerRendering, withRoutes } from "@angular/ssr";
import { App } from "./app";
import { config } from "./app-config";

const serverConfig = mergeApplicationConfig(config, {
  providers: [provideServerRendering(withRoutes([{ path: "**", renderMode: RenderMode.Server }]))],
});

const bootstrap = (context: BootstrapContext) => {
  return bootstrapApplication(App, serverConfig, context);
};

export default bootstrap;

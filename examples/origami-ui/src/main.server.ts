import { mergeApplicationConfig } from "@angular/core";
import { type BootstrapContext, bootstrapApplication } from "@angular/platform-browser";
import { RenderMode, provideServerRendering, withRoutes } from "@angular/ssr";
import { appConfig } from "./app-config.js";
import { FixtureApp } from "./fixture-app.js";

const serverConfig = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering(withRoutes([{ path: "**", renderMode: RenderMode.Server }]))],
});

const bootstrap = (context: BootstrapContext) => {
  return bootstrapApplication(FixtureApp, serverConfig, context);
};

export default bootstrap;

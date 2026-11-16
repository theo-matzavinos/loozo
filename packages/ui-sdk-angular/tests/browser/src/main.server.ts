import { mergeApplicationConfig } from "@angular/core";
import { type BootstrapContext, bootstrapApplication } from "@angular/platform-browser";
import { RenderMode, provideServerRendering, withRoutes } from "@angular/ssr";
import { App } from "./app";
import { config } from "./config";

const server = mergeApplicationConfig(config, {
  providers: [provideServerRendering(withRoutes([{ path: "**", renderMode: RenderMode.Server }]))],
});

export default (context: BootstrapContext) => bootstrapApplication(App, server, context);

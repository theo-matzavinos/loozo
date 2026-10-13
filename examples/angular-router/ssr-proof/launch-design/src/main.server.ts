import { bootstrapApplication } from "@angular/platform-browser";
import type { BootstrapContext } from "@angular/platform-browser";
import { App } from "./app";
import { serverConfig } from "./config.server";
import { RENDER_FAULTS } from "./render-faults.server";

export default async function bootstrap(context: BootstrapContext) {
  const app = await bootstrapApplication(App, serverConfig, context);

  await app.whenStable();

  const failure = app.injector.get(RENDER_FAULTS).unsupportedContext;

  if (failure) {
    app.destroy();

    throw failure;
  }

  return app;
}

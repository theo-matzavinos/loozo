import { bootstrapApplication } from "@angular/platform-browser";
import type { BootstrapContext } from "@angular/platform-browser";
import { finishLaunchRendering } from "@loozo/angular-launch/server";
import { App } from "./app";
import { serverConfig } from "./config.server";

export default async function bootstrap(context: BootstrapContext) {
  const app = await bootstrapApplication(App, serverConfig, context);

  return finishLaunchRendering(app);
}

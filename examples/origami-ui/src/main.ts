import { bootstrapApplication } from "@angular/platform-browser";
import { appConfig } from "./app-config.js";
import { FixtureApp } from "./fixture-app.js";

bootstrapApplication(FixtureApp, appConfig).catch((error: unknown) => {
  console.error(error);
});

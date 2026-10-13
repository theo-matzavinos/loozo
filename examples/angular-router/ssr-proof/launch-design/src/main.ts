import { bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app";
import { config } from "./config";

bootstrapApplication(App, config).catch((error: unknown) => console.error(error));

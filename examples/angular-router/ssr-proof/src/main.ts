import { bootstrapApplication } from "@angular/platform-browser";
import App from "./app.js";
import { config } from "./app.config.js";

void bootstrapApplication(App, config).catch((error: unknown) => {
  console.error(error);
});

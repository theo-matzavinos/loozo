import { bootstrapApplication } from "@angular/platform-browser";
import Shell from "./shell.js";
import { config } from "./app.config.js";

void bootstrapApplication(Shell, config).catch((error: unknown) => {
  console.error(error);
});

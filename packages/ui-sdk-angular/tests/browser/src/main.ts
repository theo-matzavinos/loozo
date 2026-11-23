import { enableProdMode } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app";
import { config } from "./config";

// Fixture only: the malformed-panel cases check the one-element error in production mode.
if (new URLSearchParams(location.search).get("prod") === "1") {
  enableProdMode();
}

bootstrapApplication(App, config()).catch((error: unknown) => console.error(error));

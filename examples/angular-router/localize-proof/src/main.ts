import { bootstrapApplication } from "@angular/platform-browser";
import App from "./app.js";
import { config } from "./app.config.js";

bootstrapApplication(App, config)
  .then((application) => application.whenStable())
  .then(() => {
    document.documentElement.dataset["proofStable"] = "true";
  })
  .catch((error: unknown) => {
    console.error(error);
  });

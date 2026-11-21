import { bootstrapApplication } from "@angular/platform-browser";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { App } from "./app";
import { config } from "./app-config";
import { rememberSsrButtons } from "./bench-probe";

if (document.readyState === "loading") {
  await new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  });
}

rememberSsrButtons();
window.__benchTypes = { checkbox: OrigamiCheckbox.prototype };

// The hydration span starts here.
performance.mark("bench:bootstrap");

const app = await bootstrapApplication(App, config);

await app.whenStable();
window.__benchReady = true;

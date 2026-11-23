import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withErrorBoundaries } from "@angular/router";
import Shell from "./shell.js";
import { provideSearchStorage, routes } from "../generated/routes.generated.js";

void bootstrapApplication(Shell, {
  providers: [provideRouter(routes, withErrorBoundaries()), provideSearchStorage("local")],
});

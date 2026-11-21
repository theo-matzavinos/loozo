import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withErrorBoundaries } from "@angular/router";
import Shell from "./shell.js";
import { routes } from "../generated/routes.generated.js";

void bootstrapApplication(Shell, { providers: [provideRouter(routes, withErrorBoundaries())] });

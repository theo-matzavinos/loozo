import { provideHttpClient } from "@angular/common/http";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { routes } from "../generated/routes.generated.js";
import Shell from "./shell.js";

void bootstrapApplication(Shell, { providers: [provideHttpClient(), provideRouter(routes)] });

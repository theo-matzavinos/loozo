// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record } from '@loozo/angular-router/_generated';
import { destination as destination_literal_child_route } from "./child/destination.generated.js";
import { destination as destination_literal_route } from "./destination.generated.js";

/**
 * The generated records of the children of src/routes/literal/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "child",
...record(destination_literal_child_route, destination_literal_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./child/page") }];

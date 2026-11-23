// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route_other_child_route } from "./child/route.generated.js";
import { destination as destination_other_child_route } from "./child/destination.generated.js";
import { destination as destination_other_route } from "./destination.generated.js";

/**
 * The generated records of the children of src/routes/other/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "child",
...record(destination_other_child_route, destination_other_route),
...callbacks(route_other_child_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./child/page") }];

// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route_files_$rest___route } from "./$rest[]/route.generated.js";
import { destination as destination_files_$rest___route } from "./$rest[]/destination.generated.js";
import { destination as destination_files_route } from "./destination.generated.js";

/**
 * The generated records of the children of src/routes/files/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "**",
...record(destination_files_$rest___route, destination_files_route),
...callbacks(route_files_$rest___route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./$rest[]/page") }];

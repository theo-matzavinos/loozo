// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route_projects_$projectId_route } from "./$projectId/route.generated.js";
import { destination as destination_projects_$projectId_route } from "./$projectId/destination.generated.js";
import { destination as destination_projects_route } from "./destination.generated.js";

/**
 * The generated records of the children of src/routes/projects/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: ":projectId",
...record(destination_projects_$projectId_route, destination_projects_route),
...callbacks(route_projects_$projectId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./$projectId/page") }];

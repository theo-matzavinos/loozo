// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, nativeOptions, callbacks } from '@loozo/angular-router/_generated';
import { route as route_teams_$teamId_items_$id_route } from "./items/$id/route.generated.js";
import { destination as destination_teams_$teamId_items_$id_route } from "./items/$id/destination.generated.js";
import { destination as destination_teams_$teamId_route } from "./destination.generated.js";

/**
 * The generated records of the children of src/routes/teams/$teamId/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ ...nativeOptions(route_teams_$teamId_items_$id_route),
path: "items/:id",
...record(destination_teams_$teamId_items_$id_route, destination_teams_$teamId_route),
...callbacks(route_teams_$teamId_items_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./items/$id/page") }];

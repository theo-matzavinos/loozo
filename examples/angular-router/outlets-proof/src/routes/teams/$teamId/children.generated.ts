// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route_teams_$teamId_item_$id_route } from "./item/$id/route.generated.js";
import { destination as destination_teams_$teamId_item_$id_route } from "./item/$id/destination.generated.js";
import { destination as destination_teams_$teamId_list_route } from "./list/destination.generated.js";
import { destination as destination_teams_$teamId_route } from "./destination.generated.js";

/**
 * The generated records of the children of src/routes/teams/$teamId/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "item/:id",
outlet: "detail",
...record(destination_teams_$teamId_item_$id_route),
...callbacks(route_teams_$teamId_item_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./item/$id/page") },
{ path: "list",
...record(destination_teams_$teamId_list_route, destination_teams_$teamId_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./list/page") }];

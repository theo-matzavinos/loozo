// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, nativePath } from '@loozo/angular-router/_generated';
import { destination as destination__home_route } from "../../+home/destination.generated.js";
import { destination as destination_teams_$teamId__overview_route } from "./+overview/destination.generated.js";
import { destination as destination_teams_$teamId_members_route } from "./members/destination.generated.js";

/**
 * The generated records of the children of src/routes/teams/$teamId/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
pathMatch: 'full',
...record(destination_teams_$teamId__overview_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./+overview/page") },
{ path: nativePath(destination_teams_$teamId_members_route),
...record(destination_teams_$teamId_members_route, destination_teams_$teamId__overview_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./members/page") }];

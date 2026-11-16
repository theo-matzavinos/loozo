// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route_$package_api_$symbol_route } from "./api/$symbol/route.generated.js";
import { route as route_$package_generated_api_route } from "./generated-api/route.generated.js";
import { route as route_$package_guide_$guide_route } from "./guide/$guide/route.generated.js";
import { destination as destination__home_route } from "../+home/destination.generated.js";
import { destination as destination_$package__overview_route } from "./+overview/destination.generated.js";
import { destination as destination_$package_api_$symbol_route } from "./api/$symbol/destination.generated.js";
import { destination as destination_$package_generated_api_route } from "./generated-api/destination.generated.js";
import { destination as destination_$package_guide_$guide_route } from "./guide/$guide/destination.generated.js";

/**
 * The generated records of the children of src/routes/$package/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
pathMatch: 'full',
...record(destination_$package__overview_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./+overview/page") },
{ path: "api/:symbol",
...record(destination_$package_api_$symbol_route, destination_$package__overview_route),
...callbacks(route_$package_api_$symbol_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./api/$symbol/page") },
{ path: "generated-api",
...record(destination_$package_generated_api_route, destination_$package__overview_route),
...callbacks(route_$package_generated_api_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./generated-api/page") },
{ path: "guide/:guide",
...record(destination_$package_guide_$guide_route, destination_$package__overview_route),
...callbacks(route_$package_guide_$guide_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./guide/$guide/page") }];

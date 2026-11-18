// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record } from '@loozo/angular-router/_generated';
import { destination as destination__home_route } from "../+home/destination.generated.js";
import { destination as destination_account__layout_route } from "./+layout/destination.generated.js";

/**
 * The generated records of the children of src/routes/account/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
...record(destination_account__layout_route, destination__home_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./+layout/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("./+layout/children.generated.js").then((m) => m.routes) }];

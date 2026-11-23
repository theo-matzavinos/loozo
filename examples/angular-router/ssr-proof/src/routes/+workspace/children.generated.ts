// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route__workspace_orders_route } from "./orders/route.generated.js";
import { destination as destination__home_route } from "../+home/destination.generated.js";
import { destination as destination__workspace_orders_route } from "./orders/destination.generated.js";

/**
 * The generated records of the children of src/routes/+workspace/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "orders",
...record(destination__workspace_orders_route, destination__home_route),
...callbacks(route__workspace_orders_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./orders/page"),
loadChildren: (): ReturnType<NonNullable<Routes[number]["loadChildren"]>> => import("./orders/children.generated.js").then((m) => m.routes) }];

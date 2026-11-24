// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route__workspace_orders_$id_route } from "./$id/route.generated.js";
import { destination as destination__workspace_orders_$id_route } from "./$id/destination.generated.js";
import { destination as destination__workspace_orders_route } from "./destination.generated.js";

/**
 * The generated records of the children of src/routes/+workspace/orders/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: ":id",
...record(destination__workspace_orders_$id_route, destination__workspace_orders_route),
...callbacks(route__workspace_orders_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./$id/page") }];

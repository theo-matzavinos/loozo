// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record, callbacks } from '@loozo/angular-router/_generated';
import { route as route_products__overview_route } from "./+overview/route.generated.js";
import { route as route_products_item_static_route } from "./item-static/route.generated.js";
import { route as route_products_item_$id_route } from "./item/$id/route.generated.js";
import { route as route_products_list_route } from "./list/route.generated.js";
import { destination as destination__home_route } from "../+home/destination.generated.js";
import { destination as destination_products__overview_route } from "./+overview/destination.generated.js";
import { destination as destination_products_item_static_route } from "./item-static/destination.generated.js";
import { destination as destination_products_item_$id_route } from "./item/$id/destination.generated.js";
import { destination as destination_products_list_route } from "./list/destination.generated.js";

/**
 * The generated records of the children of src/routes/products/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "",
...record(destination_products__overview_route, destination__home_route),
...callbacks(route_products__overview_route, { onlyAtEnd: true }),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./+overview/page") },
{ path: "item",
outlet: "detail",
...record(destination_products_item_static_route),
...callbacks(route_products_item_static_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./item-static/page") },
{ path: "item/:id",
outlet: "detail",
...record(destination_products_item_$id_route),
...callbacks(route_products_item_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./item/$id/page") },
{ path: "list",
...record(destination_products_list_route, destination_products__overview_route),
...callbacks(route_products_list_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./list/page") }];

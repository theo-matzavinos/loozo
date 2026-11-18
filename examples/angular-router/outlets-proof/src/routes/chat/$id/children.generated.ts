// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record } from '@loozo/angular-router/_generated';
import { destination as destination_chat_$id_route } from "./destination.generated.js";
import { destination as destination_chat_$id_settings_route } from "./settings/destination.generated.js";

/**
 * The generated records of the children of src/routes/chat/$id/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "settings",
...record(destination_chat_$id_settings_route, destination_chat_$id_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./settings/page") }];

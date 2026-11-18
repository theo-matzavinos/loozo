// @loozo/angular-router routegen: owned children.generated.ts
import type { Routes } from '@angular/router';
import { record } from '@loozo/angular-router/_generated';
import { destination as destination_account__layout_help_route } from "./help/destination.generated.js";
import { destination as destination_account__layout_profile_route } from "./profile/destination.generated.js";

/**
 * The generated records of the children of src/routes/account/+layout/route.ts, loaded lazily by its record.
 * Regenerate through the router's Architect companions instead of editing this file.
 */
export const routes: Routes = [{ path: "help",
outlet: "aside",
...record(destination_account__layout_help_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./help/page") },
{ path: "profile",
...record(destination_account__layout_profile_route),
loadComponent: (): ReturnType<NonNullable<Routes[number]["loadComponent"]>> => import("./profile/page") }];

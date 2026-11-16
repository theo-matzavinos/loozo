import type { Routes } from "@angular/router";
import { Controlled } from "./controlled";
import { Defer } from "./defer";
import { Errors } from "./errors";
import { Home } from "./home";
import { Lifecycle } from "./lifecycle";
import { OpenOrder } from "./open-order";
import { Remap } from "./remap";
import { ReplaceItems } from "./replace-items";

export const routes: Routes = [
  { path: "", component: Home },
  { path: "controlled", component: Controlled },
  { path: "lifecycle", component: Lifecycle },
  { path: "defer", component: Defer },
  { path: "open-order", component: OpenOrder },
  { path: "errors", component: Errors },
  { path: "replace-items", component: ReplaceItems },
  { path: "remap", component: Remap },
];

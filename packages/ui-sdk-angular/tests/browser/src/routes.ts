import type { Routes } from "@angular/router";
import { Controlled } from "./controlled";
import { Defer } from "./defer";
import { Errors } from "./errors";
import { FormControls } from "./form-controls";
import { FormWarnings } from "./form-warnings";
import { Forms } from "./forms";
import { FormsDefer } from "./forms-defer";
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
  { path: "forms", component: Forms },
  { path: "form-controls", component: FormControls },
  { path: "form-warnings", component: FormWarnings },
  { path: "forms-defer", component: FormsDefer },
];

import type { Routes } from "@angular/router";
import { Controlled } from "./controlled";
import { Defer } from "./defer";
import { Errors } from "./errors";
import { FormControls } from "./form-controls";
import { FormWarnings } from "./form-warnings";
import { Forms } from "./forms";
import { FormsDefer } from "./forms-defer";
import { Groups, GroupsDefer } from "./groups";
import { Home } from "./home";
import { Lifecycle } from "./lifecycle";
import { OpenOrder } from "./open-order";
import { Remap } from "./remap";
import { ReplaceItems } from "./replace-items";
import { SignalFormsRoute } from "./signal-forms";
import { SignalFormsComposers } from "./signal-forms-composers";
import { SignalFormsBoolean, SignalFormsHidden, SignalFormsUndefined } from "./signal-forms-edges";
import { SignalFormsTypes } from "./signal-forms-types";
import { VirtualFocus } from "./virtual-focus";

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
  { path: "signal-forms", component: SignalFormsRoute },
  { path: "signal-forms-composers", component: SignalFormsComposers },
  { path: "signal-forms-undefined", component: SignalFormsUndefined },
  { path: "signal-forms-boolean", component: SignalFormsBoolean },
  { path: "signal-forms-hidden", component: SignalFormsHidden },
  { path: "signal-forms-types", component: SignalFormsTypes },
  { path: "groups", component: Groups },
  { path: "groups-defer", component: GroupsDefer },
  { path: "virtual-focus", component: VirtualFocus },
];

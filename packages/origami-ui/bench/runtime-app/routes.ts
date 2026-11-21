import { type Routes } from "@angular/router";
import { CheckboxList } from "./checkbox-list";
import { MenuOpen } from "./menu";
import { Mount } from "./mount";
import { PlainList } from "./plain-list";
import { PopoverOpen } from "./popover";
import { SelectOpen } from "./select";
import { TooltipOpen } from "./tooltip";

// Every route is eager: the bench measures the primitives, not lazy loading.
export const routes: Routes = [
  { path: "hydrate/checkbox-1000", component: CheckboxList },
  { path: "hydrate/plain-1000", component: PlainList },
  { path: "mount/checkbox-1000", component: Mount, data: { kind: "checkbox" } },
  { path: "mount/plain-1000", component: Mount, data: { kind: "plain" } },
  { path: "select-1000", component: SelectOpen },
  { path: "menu-100", component: MenuOpen },
  { path: "popover", component: PopoverOpen },
  { path: "tooltip", component: TooltipOpen },
];

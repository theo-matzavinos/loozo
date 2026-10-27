import type { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "core",
    loadComponent: () => import("./fixtures/core.js").then((module) => module.CoreFixture),
  },
  {
    path: "composition",
    loadComponent: () =>
      import("./fixtures/composition.js").then((module) => module.CompositionFixture),
  },
  {
    path: "popover",
    loadComponent: () => import("./fixtures/popover.js").then((module) => module.PopoverFixture),
  },
  {
    path: "tooltip",
    loadComponent: () => import("./fixtures/tooltip.js").then((module) => module.TooltipFixture),
  },
  {
    path: "field",
    loadComponent: () => import("./fixtures/field.js").then((module) => module.FieldFixture),
  },
  {
    path: "checkbox",
    loadComponent: () => import("./fixtures/checkbox.js").then((module) => module.CheckboxFixture),
  },
  {
    path: "switch",
    loadComponent: () => import("./fixtures/switch.js").then((module) => module.SwitchFixture),
  },
  {
    path: "toggle",
    loadComponent: () => import("./fixtures/toggle.js").then((module) => module.ToggleFixture),
  },
  {
    path: "group-field",
    loadComponent: () =>
      import("./fixtures/group-field.js").then((module) => module.GroupFieldFixture),
  },
  {
    path: "dialog",
    loadComponent: () => import("./fixtures/dialog.js").then((module) => module.DialogFixture),
  },
  {
    path: "dialog-open",
    loadComponent: () =>
      import("./fixtures/dialog-open.js").then((module) => module.DialogOpenFixture),
  },
  {
    path: "alert-dialog",
    loadComponent: () =>
      import("./fixtures/alert-dialog.js").then((module) => module.AlertDialogFixture),
  },
  {
    path: "dialog-opener",
    loadComponent: () =>
      import("./fixtures/dialog-opener.js").then((module) => module.DialogOpenerFixture),
  },
  {
    path: "select",
    loadComponent: () => import("./fixtures/select.js").then((module) => module.SelectFixture),
  },
  {
    path: "calendar",
    loadComponent: () => import("./fixtures/calendar.js").then((module) => module.CalendarFixture),
  },
  {
    path: "described-by",
    loadComponent: () =>
      import("./fixtures/described-by.js").then((module) => module.DescribedByFixture),
  },
  {
    path: "hydration",
    loadComponent: () =>
      import("./fixtures/seeds/eager-hydration-consumer.js").then(
        (module) => module.EagerHydrationConsumer,
      ),
  },
  {
    path: "nested",
    loadComponent: () => import("./fixtures/nested.js").then((module) => module.NestedHydration),
  },
  {
    path: "errors",
    loadComponent: () => import("./fixtures/errors.js").then((module) => module.ErrorFixture),
  },
  { path: "", pathMatch: "full", redirectTo: "core" },
];

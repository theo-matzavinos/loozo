import type { Routes } from "@angular/router";

/** No eager fixture imports: each deferred route retains independent dependency analysis. */
export const routes: Routes = [
  {
    path: "core",
    loadComponent: () =>
      import("./fixtures/core-deferred.js").then((module) => module.CoreDeferred),
  },
  {
    path: "composition",
    loadComponent: () =>
      import("./fixtures/composition-deferred.js").then((module) => module.CompositionDeferred),
  },
  {
    path: "popover",
    loadComponent: () =>
      import("./fixtures/popover-deferred.js").then((module) => module.PopoverDeferred),
  },
  {
    path: "tooltip",
    loadComponent: () =>
      import("./fixtures/tooltip-deferred.js").then((module) => module.TooltipDeferred),
  },
  {
    path: "field",
    loadComponent: () =>
      import("./fixtures/field-deferred.js").then((module) => module.FieldDeferred),
  },
  {
    path: "checkbox",
    loadComponent: () =>
      import("./fixtures/checkbox-deferred.js").then((module) => module.CheckboxDeferred),
  },
  {
    path: "switch",
    loadComponent: () =>
      import("./fixtures/switch-deferred.js").then((module) => module.SwitchDeferred),
  },
  {
    path: "toggle",
    loadComponent: () =>
      import("./fixtures/toggle-deferred.js").then((module) => module.ToggleDeferred),
  },
  {
    path: "group-field",
    loadComponent: () =>
      import("./fixtures/group-field-deferred.js").then((module) => module.GroupFieldDeferred),
  },
  {
    path: "dialog",
    loadComponent: () =>
      import("./fixtures/dialog-deferred.js").then((module) => module.DialogDeferred),
  },
  {
    path: "dialog-open",
    loadComponent: () =>
      import("./fixtures/dialog-open-deferred.js").then((module) => module.DialogOpenDeferred),
  },
  {
    path: "alert-dialog",
    loadComponent: () =>
      import("./fixtures/alert-dialog-deferred.js").then((module) => module.AlertDialogDeferred),
  },
  {
    path: "described-by",
    loadComponent: () =>
      import("./fixtures/described-by-deferred.js").then((module) => module.DescribedByDeferred),
  },
  {
    path: "hydration",
    loadComponent: () =>
      import("./fixtures/seeds/hydration-consumer.js").then(
        (module) => module.IncrementalHydrationConsumer,
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

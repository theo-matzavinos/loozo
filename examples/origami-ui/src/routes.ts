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

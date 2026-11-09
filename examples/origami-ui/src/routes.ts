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
    path: "dialog-opener",
    loadComponent: () =>
      import("./fixtures/dialog-opener-deferred.js").then((module) => module.DialogOpenerDeferred),
  },
  {
    path: "select",
    loadComponent: () =>
      import("./fixtures/select-deferred.js").then((module) => module.SelectDeferred),
  },
  {
    path: "calendar",
    loadComponent: () =>
      import("./fixtures/calendar-deferred.js").then((module) => module.CalendarDeferred),
  },
  {
    path: "date-field",
    loadComponent: () =>
      import("./fixtures/date-field-deferred.js").then((module) => module.DateFieldDeferred),
  },
  {
    path: "date-picker",
    loadComponent: () =>
      import("./fixtures/date-picker-deferred.js").then((module) => module.DatePickerDeferred),
  },
  {
    path: "date-time-picker",
    loadComponent: () =>
      import("./fixtures/date-picker-date-time-deferred.js").then(
        (module) => module.DatePickerDateTimeDeferred,
      ),
  },
  {
    path: "time-field",
    loadComponent: () =>
      import("./fixtures/date-field-time-deferred.js").then((module) => module.TimeFieldDeferred),
  },
  {
    path: "menu",
    loadComponent: () =>
      import("./fixtures/menu-deferred.js").then((module) => module.MenuDeferred),
  },
  {
    path: "toast",
    loadComponent: () =>
      import("./fixtures/toast-deferred.js").then((module) => module.ToastDeferred),
  },
  {
    path: "slider",
    loadComponent: () =>
      import("./fixtures/slider-deferred.js").then((module) => module.SliderDeferred),
  },
  {
    path: "toast-modal",
    loadComponent: () =>
      import("./fixtures/toast-modal-deferred.js").then((module) => module.ToastModalDeferred),
  },
  {
    path: "toast-speech",
    loadComponent: () =>
      import("./fixtures/toast-speech.js").then((module) => module.ToastSpeechFixture),
  },
  {
    path: "menu-speech",
    loadComponent: () =>
      import("./fixtures/menu-speech.js").then((module) => module.MenuSpeechFixture),
  },
  {
    path: "calendar-speech",
    loadComponent: () =>
      import("./fixtures/calendar-speech.js").then((module) => module.CalendarSpeechFixture),
  },
  {
    path: "calendar-probe-speech",
    loadComponent: () =>
      import("./fixtures/calendar-probe-speech.js").then(
        (module) => module.CalendarProbeSpeechFixture,
      ),
  },
  {
    path: "date-field-speech",
    loadComponent: () =>
      import("./fixtures/date-field-speech.js").then((module) => module.DateFieldSpeechFixture),
  },
  {
    path: "date-time-field",
    loadComponent: () =>
      import("./fixtures/date-field-date-time-deferred.js").then(
        (module) => module.DateTimeFieldDeferred,
      ),
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

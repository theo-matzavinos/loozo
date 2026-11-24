import { defineRoute, enumParam, remembered, retained, stringParam } from "@loozo/angular-router";

// A pathless layout that owns an app-wide key: every typed link to a page below it keeps
// the current workspace unless the caller sets or drops it. Its density is remembered.
export default defineRoute("", {
  search: {
    workspace: retained(stringParam),
    density: remembered(enumParam(["comfortable", "compact"]), "workspace.density"),
  },
});

import { enumParam, remembered, retained, stringParam } from "@loozo/angular-router";

// A pathless layout that owns an app-wide key: every typed link to a page below it keeps
// the current workspace unless the caller sets or drops it. Its density is remembered.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("", {
  search: {
    workspace: retained(stringParam),
    density: remembered(enumParam(["comfortable", "compact"]), "workspace.density"),
  },
}, "src/routes/+workspace/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts

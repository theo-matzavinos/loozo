import { defineRoute, retained, stringParam } from "@loozo/angular-router";

// A pathless layout that owns an app-wide key: every typed link to a page below it keeps
// the current workspace unless the caller sets or drops it.
export default defineRoute("", { search: { workspace: retained(stringParam) } });

import { defineRoute, retained, stringParam } from "@loozo/angular-router";

// An unrelated owner of a retained key with the same name: its value never reaches
// pages below +workspace, nor theirs this subtree.
export default defineRoute("other", { search: { workspace: retained(stringParam) } }).resolve({
  label: () => "other",
});

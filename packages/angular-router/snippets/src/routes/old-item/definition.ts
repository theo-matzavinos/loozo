import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../team/definition.js";
import item from "../item/definition.js";

export default defineRoute("old-items/$id", {
  parent: team,
  params: { id: numberParam },
  redirect: {
    to: item,
    search: { mode: "drop" }, // or "preserve", or { mode: "replace", values }
    fragment: { mode: "drop" }, // or "preserve", or { mode: "replace", value }
  },
});

import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../../route.js";
import { destination as item } from "../../items/$id/destination.generated.js";

export default defineRoute("old-items/$id", {
  parent: team,
  params: { id: numberParam },
}).redirect({
  to: item,
  search: { mode: "drop" }, // or "preserve", or { mode: "replace", values }
  fragment: { mode: "drop" }, // or "preserve", or { mode: "replace", value }
});

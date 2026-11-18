import { defineRoute, numberParam } from "@loozo/angular-router";
import { destination as item } from "../../products/item/$id/destination.generated.js";

// The query belongs to the primary route: products reads the preserved sort.
export default defineRoute("old-item/$id", { params: { id: numberParam } }).redirect({
  to: item,
  search: { mode: "preserve" },
  fragment: { mode: "drop" },
});

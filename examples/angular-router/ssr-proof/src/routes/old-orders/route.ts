import { defineRoute } from "@loozo/angular-router";
import { destination as orders } from "../+workspace/orders/destination.generated.js";

// A typed redirect into the orders page without its remembered key: a restore follows.
export default defineRoute("old-orders", {}).redirect({
  to: orders,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});

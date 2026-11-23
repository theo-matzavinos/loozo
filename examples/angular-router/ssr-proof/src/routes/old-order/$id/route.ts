import { defineRoute, numberParam } from "@loozo/angular-router";
import { destination as order } from "../../+workspace/orders/$id/destination.generated.js";

// A typed redirect into an order: for order 42, which is missing, the not-found page follows.
export default defineRoute("old-order/$id", { params: { id: numberParam } }).redirect({
  to: order,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});

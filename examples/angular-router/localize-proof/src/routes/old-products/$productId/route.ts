import { defineRoute, numberParam } from "@loozo/angular-router";
import parent from "../route.js";
import { destination as product } from "../../products/$productId/destination.generated.js";

export default defineRoute("$productId", { parent, params: { productId: numberParam } }).redirect({
  to: product,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});

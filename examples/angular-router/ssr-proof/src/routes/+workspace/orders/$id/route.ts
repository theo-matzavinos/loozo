import { defineRoute, numberParam } from "@loozo/angular-router";
import orders from "../route.js";
import { MissingResource } from "../../../../missing-resource.js";

export default defineRoute("$id", { parent: orders, params: { id: numberParam } }).resolve({
  order: ({ params }) => {
    // The proof's stand-in for an order that was deleted.
    if (params.id === 42) {
      throw new MissingResource(`No order ${params.id}`);
    }

    return `order ${params.id}`;
  },
});

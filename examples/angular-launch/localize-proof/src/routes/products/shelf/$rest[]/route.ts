import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../../route";

// A catchall branch: /products/(detail:shelf/…), and /products/(detail:shelf) for none.
export default defineRoute("shelf/$rest[]", {
  parent,
  outlet: "detail",
  params: { rest: stringParam },
});

import { defineRoute } from "@loozo/angular-router";
import parent from "../route.js";
import { guarded } from "../../../probe.js";

// The empty leaf at detail's anchor, guarded like home.
export default defineRoute("", { parent }).canMatch([
  (_inputs, _route, segments) => guarded("overview", segments),
]);

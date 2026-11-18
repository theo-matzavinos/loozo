import { defineRoute } from "@loozo/angular-router";
import { guarded, visit } from "../../probe.js";

// The empty leaf at chat's anchor: generation matches it by prefix and gates its canMatch.
export default defineRoute("", {})
  .canMatch([(_inputs, _route, segments) => guarded("home", segments)])
  .resolve({ visits: () => visit() });

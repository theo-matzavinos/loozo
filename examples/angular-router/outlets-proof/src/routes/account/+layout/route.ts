import { defineRoute } from "@loozo/angular-router";
import parent from "../route.js";

// An empty-path primary parent: it adds no segment to the aside branch's anchor.
export default defineRoute("", { parent });

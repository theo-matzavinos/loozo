import { defineRoute } from "@loozo/angular-router";
import parent from "../route.js";

// Takes the same display path as the literal route below; their positions differ.
export default defineRoute("item", { parent, outlet: "detail" });

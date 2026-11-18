import { defineRoute } from "@loozo/angular-router";
import parent from "../route.js";

export default defineRoute("help", { parent, outlet: "aside" });

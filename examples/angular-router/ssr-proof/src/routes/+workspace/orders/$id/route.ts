import { defineRoute, numberParam } from "@loozo/angular-router";
import orders from "../route.js";

export default defineRoute("$id", { parent: orders, params: { id: numberParam } });

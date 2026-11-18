import { defineRoute, stringParam } from "@loozo/angular-router";
import parent from "../route.js";

export default defineRoute("$rest[]", { parent, params: { rest: stringParam } });

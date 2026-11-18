import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../route";

export default defineRoute("$rest[]", { parent, params: { rest: stringParam } });

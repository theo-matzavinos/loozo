import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../../route";

// A dynamic anchor: a team named like a route word stays as it is.
export default defineRoute("teams/$team", { parent, params: { team: stringParam } });

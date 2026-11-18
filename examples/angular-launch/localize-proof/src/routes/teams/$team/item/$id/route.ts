import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../../route";

// /teams/<team>/(detail:item/<id>).
export default defineRoute("item/$id", { parent, outlet: "detail", params: { id: stringParam } });

import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../../route";

// A nested branch: /products/(detail:item/3).
export default defineRoute("item/$id", { parent, outlet: "detail", params: { id: stringParam } });

import { defineRoute, numberParam } from "@loozo/angular-router";
import parent from "../../route.js";

// A branch below a dynamic anchor: teams/$teamId.
export default defineRoute("item/$id", { parent, outlet: "detail", params: { id: numberParam } });

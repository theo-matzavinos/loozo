import { defineRoute, numberParam } from "@loozo/angular-router";
import parent from "../../route.js";

export default defineRoute("item/$id", { parent, outlet: "detail", params: { id: numberParam } });

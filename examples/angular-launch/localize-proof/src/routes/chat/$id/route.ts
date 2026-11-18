import { defineRoute } from "@loozo/angular-launch";
import { stringParam } from "@loozo/angular-router";
import parent from "../../route";

// A root branch whose outlet name is also a route word: /(chat:chat/7).
export default defineRoute("chat/$id", { parent, outlet: "chat", params: { id: stringParam } });

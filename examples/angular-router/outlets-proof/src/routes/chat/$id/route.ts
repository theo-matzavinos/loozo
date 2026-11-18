import { defineRoute, numberParam } from "@loozo/angular-router";

// A root-level named branch: /(chat:chat/7) beside any primary page.
export default defineRoute("chat/$id", { outlet: "chat", params: { id: numberParam } });

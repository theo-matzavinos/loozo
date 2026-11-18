import { numberParam } from "@loozo/angular-router";

// A root-level named branch: /(chat:chat/7) beside any primary page.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("chat/$id", { outlet: "chat", params: { id: numberParam } }, "src/routes/chat/$id/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts

import { stringParam } from "@loozo/angular-router";

// The chat outlet's not-found panel: the root catchall doesn't cover named outlets.
/** This route's destination: an inert URL reference for createUrl, handle link/navigate, redirect targets and the active route's is/contains. */ const routegen$destination = routegen$defineDestination("$rest[]", { outlet: "chat", params: { rest: stringParam } }, "src/routes/chat/$rest[]/route.ts");
import { defineDestination as routegen$defineDestination } from "@loozo/angular-router/_generated";
export { routegen$destination as destination };
// @loozo/angular-router routegen: owned destination.generated.ts

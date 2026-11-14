import { defineRoute } from "@loozo/angular-router";
import parent from "../route";
import { injectRpc } from "./rpc.generated";

// The page renders from a query on the server, then follows the stream in the browser.
export default defineRoute("live", { parent }).resolve({
  todos: () => injectRpc().live.snapshot(),
});

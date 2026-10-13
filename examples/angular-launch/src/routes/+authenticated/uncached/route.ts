import { defineRoute } from "@loozo/angular-router";
import parent from "../route";
import { injectRpc } from "./rpc.generated";
export default defineRoute("uncached", {
  parent,
  resolve: { todos: () => injectRpc().session.current({ transferCache: false }) },
});

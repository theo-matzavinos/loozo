import { defineRoute } from "@loozo/angular-router";
import parent from "../route";
import { injectRpc } from "./rpc.generated";

export default defineRoute("todos", {
  parent,
  resolve: {
    todos: () => injectRpc().todos.list(),
    session: () => injectRpc().session.current(),
  },
});

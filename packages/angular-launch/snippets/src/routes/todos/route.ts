import { defineRoute } from "@loozo/angular-router";
import parent from "../route.js";
import { injectRpc } from "./rpc.generated.js";

export default defineRoute("todos", { parent }).resolve({
  todos: () => injectRpc().todos.list(),
});

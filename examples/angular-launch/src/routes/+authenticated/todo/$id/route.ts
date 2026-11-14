import { defineRoute, stringParam } from "@loozo/angular-router";
import parent from "../../route";
import { injectRpc } from "./rpc.generated";

export default defineRoute("todo/$id", { parent, params: { id: stringParam } }).resolve({
  todo: ({ params }) => injectRpc().todo.get({ id: params.id }),
});

import { defineRoute } from "@loozo/angular-router";
import parent from "../route";
import { injectRpc } from "./rpc.generated";

export default defineRoute("about", { parent }).resolve({
  summary: () => injectRpc().about.summary(),
});

import { defineRoute, numberParam } from "@loozo/angular-router";
import { destination as chat } from "../../chat/$id/destination.generated.js";

// A redirect into a branch replaces the whole URL with the branch's own.
export default defineRoute("old-chat/$id", { params: { id: numberParam } }).redirect({
  to: chat,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});

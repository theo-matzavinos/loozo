import { defineRoute, numberParam } from "@loozo/angular-router";
import { destination as chat } from "../../chat/$id/destination.generated.js";

// A redirect into a root-level branch that keeps the source's query and fragment.
export default defineRoute("old-chat-kept/$id", { params: { id: numberParam } }).redirect({
  to: chat,
  search: { mode: "preserve" },
  fragment: { mode: "preserve" },
});

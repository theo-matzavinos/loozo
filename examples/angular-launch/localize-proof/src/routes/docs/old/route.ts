import { defineRoute } from "@loozo/angular-launch";
import parent from "../route";
import { destination as docs } from "../destination.generated";

// A redirect declaration below a parent: its source URL holds two declarations' words.
export default defineRoute("old", { parent }).redirect({
  to: docs,
  search: { mode: "drop" },
  fragment: { mode: "drop" },
});

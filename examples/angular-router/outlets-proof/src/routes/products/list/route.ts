import { defineRoute, numberParam } from "@loozo/angular-router";
import parent from "../route.js";
import { hold } from "../../../probe.js";

export default defineRoute("list", { parent, search: { page: numberParam } }).resolve({
  held: () => hold(),
});

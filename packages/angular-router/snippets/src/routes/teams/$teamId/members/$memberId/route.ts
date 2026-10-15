import { defineRoute, numberParam } from "@loozo/angular-router";
import team from "../../route.js";

export default defineRoute("members/$memberId", {
  parent: team,
  params: { memberId: numberParam },
});

import { defineRoute, numberParam } from "@loozo/angular-router";
import projects from "../route.js";

export default defineRoute("$projectId", {
  parent: projects,
  params: { projectId: numberParam },
});

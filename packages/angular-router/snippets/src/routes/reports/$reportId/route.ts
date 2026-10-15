import { defineRoute, numberParam } from "@loozo/angular-router";

export default defineRoute("reports/$reportId", {
  params: { reportId: numberParam },
  canActivate: [({ params }) => params.reportId > 0],
});

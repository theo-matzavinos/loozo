import { defineRoute, numberParam } from "@loozo/angular-router";
import { ReportError } from "./report-error.js";

export default defineRoute("reports/$reportId", {
  params: { reportId: numberParam },
})
  .canActivate([({ params }) => params.reportId > 0])
  .errorComponent(ReportError);

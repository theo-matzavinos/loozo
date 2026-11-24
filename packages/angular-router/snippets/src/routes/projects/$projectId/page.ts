import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({ template: "Project {{ route.params().projectId }}" })
export default class ProjectPage {
  readonly route = injectRoute();
}

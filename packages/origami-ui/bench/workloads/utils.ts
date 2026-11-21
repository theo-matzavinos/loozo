import { Component } from "@angular/core";
import { injectUniqueId } from "@loozo/origami-ui/utils";

@Component({
  selector: "bench-root, bench-utils",
  template: `<span [id]="id">Utility ID</span>`,
})
export class Workload {
  readonly id = injectUniqueId("bench");
}

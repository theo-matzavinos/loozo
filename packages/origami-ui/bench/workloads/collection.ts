import { Component, signal } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionItem } from "@loozo/origami-ui/collection";

@Component({
  selector: "bench-root, bench-collection",
  imports: [OrigamiCollection, OrigamiCollectionItem],
  template: `
    <ol ogCollection #collection="ogCollection">
      @for (section of sections(); track section) {
        <li ogCollectionItem [value]="section">{{ section }}</li>
      }
    </ol>
    <p>
      @for (item of collection.state.items(); track $index) {
        <span>{{ item.value() }}</span>
      }
    </p>
  `,
})
export class Workload {
  readonly sections = signal<readonly string[]>(["billing", "shipping", "returns"]);
}

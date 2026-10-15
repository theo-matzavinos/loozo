import { Component, signal } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionItem } from "@loozo/origami-ui/collection";

@Component({
  selector: "app-sections",
  imports: [OrigamiCollection, OrigamiCollectionItem],
  template: `
    <ol ogCollection #collection="ogCollection">
      @for (section of sections(); track section) {
        <li ogCollectionItem [value]="section">{{ section }}</li>
      }
    </ol>

    <button type="button" (click)="reverse()">Reverse</button>

    <p>
      In rendered order:
      @for (item of collection.state.items(); track $index) {
        <span>{{ item.value() }}</span>
      }
    </p>
  `,
})
export class Sections {
  readonly sections = signal<readonly string[]>(["billing", "shipping", "returns"]);

  reverse(): void {
    this.sections.update((sections) => [...sections].reverse());
  }
}

import { Component, signal } from "@angular/core";
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";

@Component({
  selector: "bench-root, bench-select",
  imports: [OrigamiSelect, OrigamiSelectTrigger, OrigamiSelectContent, OrigamiSelectOption],
  template: `
    <div ogSelect [(value)]="country" #select="ogSelect">
      <button ogSelectTrigger aria-label="Country">
        {{ select.state.selectedOption()?.label ?? "Choose a country" }}
      </button>
      <div ogSelectContent>
        @for (option of countries; track option.id) {
          <div ogSelectOption [value]="option.id" [label]="option.name">{{ option.name }}</div>
        }
      </div>
    </div>
  `,
})
export class Workload {
  readonly country = signal<number | null>(300);
  readonly countries = [
    { id: 250, name: "France" },
    { id: 300, name: "Greece" },
    { id: 380, name: "Italy" },
  ];
}

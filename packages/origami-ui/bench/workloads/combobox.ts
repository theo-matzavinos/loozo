import { Component, computed, signal } from "@angular/core";
import {
  OrigamiCombobox,
  OrigamiComboboxContent,
  OrigamiComboboxInput,
  OrigamiComboboxOption,
  OrigamiComboboxTrigger,
} from "@loozo/origami-ui/combobox";

const countries = [
  { id: 250, name: "France" },
  { id: 300, name: "Greece" },
  { id: 380, name: "Italy" },
];

@Component({
  selector: "bench-root, bench-combobox",
  imports: [
    OrigamiCombobox,
    OrigamiComboboxInput,
    OrigamiComboboxTrigger,
    OrigamiComboboxContent,
    OrigamiComboboxOption,
  ],
  template: `
    <div ogCombobox [(value)]="country" [(query)]="query">
      <input ogComboboxInput aria-label="Country" />
      <button ogComboboxTrigger aria-label="All countries">▾</button>
      <div ogComboboxContent>
        @for (option of matches(); track option.id) {
          <div ogComboboxOption [value]="option.id" [label]="option.name">{{ option.name }}</div>
        }
      </div>
    </div>
  `,
})
export class Workload {
  readonly country = signal<number | null>(300);
  readonly query = signal("Greece");
  readonly matches = computed(() => {
    const query = this.query().trim().toLowerCase();
    const found = [];

    for (const country of countries) {
      if (country.name.toLowerCase().startsWith(query)) {
        found.push(country);
      }
    }

    return found;
  });
}

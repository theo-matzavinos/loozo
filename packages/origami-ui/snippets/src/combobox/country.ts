import { Component, computed, input, signal } from "@angular/core";
import {
  OrigamiCombobox,
  OrigamiComboboxContent,
  OrigamiComboboxInput,
  OrigamiComboboxOption,
  OrigamiComboboxTrigger,
} from "@loozo/origami-ui/combobox";

type Country = { readonly id: number; readonly name: string };

const countries: readonly Country[] = [
  { id: 40, name: "Austria" },
  { id: 56, name: "Belgium" },
  { id: 196, name: "Cyprus" },
  { id: 250, name: "France" },
  { id: 276, name: "Germany" },
  { id: 300, name: "Greece" },
  { id: 380, name: "Italy" },
  { id: 528, name: "Netherlands" },
  { id: 620, name: "Portugal" },
  { id: 724, name: "Spain" },
];

// You filter: the Combobox writes what's typed to `query`, and only the matches are rendered.
@Component({
  selector: "app-country-search",
  imports: [
    OrigamiCombobox,
    OrigamiComboboxInput,
    OrigamiComboboxTrigger,
    OrigamiComboboxContent,
    OrigamiComboboxOption,
  ],
  template: `
    <div ogCombobox [(value)]="country" [(query)]="query" [disabled]="disabled()" class="field">
      <input ogComboboxInput aria-label="Country" placeholder="Search countries" />
      <button ogComboboxTrigger aria-label="All countries">▾</button>
      <div ogComboboxContent class="list" [gap]="4">
        @for (option of matches(); track option.id) {
          <div ogComboboxOption [value]="option.id" [label]="option.name">{{ option.name }}</div>
        } @empty {
          <p class="empty">No country starts with “{{ query() }}”.</p>
        }
      </div>
    </div>
    <p>Country ID: {{ country() ?? "none" }}</p>
  `,
  styles: `
    .field {
      display: inline-flex;
      gap: 0.25rem;
    }

    .list {
      min-inline-size: var(--og-anchor-width);
      max-block-size: min(15rem, var(--og-available-height));
      overflow-y: auto;
      padding: 0.25rem;
      border: 1px solid currentColor;
      color: inherit;
      background: var(--surface, Canvas);
    }

    [ogComboboxOption] {
      padding: 0.25rem 0.5rem;
      cursor: default;
    }

    [ogComboboxOption][data-active] {
      background: color-mix(in srgb, currentColor 15%, transparent);
    }

    [ogComboboxOption][data-selected] {
      font-weight: 600;
    }

    .empty {
      margin: 0;
      padding: 0.25rem 0.5rem;
    }
  `,
})
export class CountrySearch {
  readonly disabled = input(false);
  readonly country = signal<number | null>(300);
  // The chosen country's name: the Combobox doesn't look labels up for a value you set.
  readonly query = signal("Greece");

  /** Every country while the input shows the chosen one's name, otherwise those it starts. */
  readonly matches = computed(() => {
    const query = this.query().trim().toLowerCase();
    const found: Country[] = [];

    for (const country of countries) {
      if (country.id === this.country() && country.name.toLowerCase() === query) {
        return countries;
      }

      if (country.name.toLowerCase().startsWith(query)) {
        found.push(country);
      }
    }

    return found;
  });
}

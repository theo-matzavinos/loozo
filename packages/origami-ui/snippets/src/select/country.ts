import { Component, input, signal } from "@angular/core";
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";

type Country = { readonly id: number; readonly name: string; readonly flag: string };

// Numeric IDs, as a form model holds them: the value type is inferred from the binding.
@Component({
  selector: "app-country",
  imports: [OrigamiSelect, OrigamiSelectTrigger, OrigamiSelectContent, OrigamiSelectOption],
  template: `
    <div ogSelect [(value)]="country" [disabled]="disabled()" #select="ogSelect">
      <button ogSelectTrigger class="trigger" aria-label="Country">
        {{ select.state.selectedOption()?.label ?? "Choose a country" }}
      </button>
      <div ogSelectContent class="list" [gap]="4">
        @for (option of countries; track option.id) {
          <div ogSelectOption [value]="option.id" [label]="option.name">
            {{ option.flag }} {{ option.name }}
          </div>
        }
      </div>
    </div>
    <p>Country ID: {{ country() ?? "none" }}</p>
  `,
  styles: `
    .trigger[data-placeholder] {
      opacity: 0.7;
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

    [ogSelectOption] {
      padding: 0.25rem 0.5rem;
      cursor: default;
    }

    [ogSelectOption][data-active] {
      background: color-mix(in srgb, currentColor 15%, transparent);
    }

    [ogSelectOption][data-selected] {
      font-weight: 600;
    }
  `,
})
export class CountrySelect {
  readonly disabled = input(false);
  readonly country = signal<number | null>(300);
  readonly countries: readonly Country[] = [
    { id: 40, name: "Austria", flag: "🇦🇹" },
    { id: 56, name: "Belgium", flag: "🇧🇪" },
    { id: 196, name: "Cyprus", flag: "🇨🇾" },
    { id: 250, name: "France", flag: "🇫🇷" },
    { id: 276, name: "Germany", flag: "🇩🇪" },
    { id: 300, name: "Greece", flag: "🇬🇷" },
    { id: 380, name: "Italy", flag: "🇮🇹" },
    { id: 528, name: "Netherlands", flag: "🇳🇱" },
    { id: 620, name: "Portugal", flag: "🇵🇹" },
    { id: 724, name: "Spain", flag: "🇪🇸" },
  ];
}

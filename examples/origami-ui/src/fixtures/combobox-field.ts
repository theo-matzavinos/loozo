import { Component, computed, inject, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import {
  OrigamiCombobox,
  OrigamiComboboxContent,
  OrigamiComboboxInput,
  OrigamiComboboxOption,
} from "@loozo/origami-ui/combobox";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";

// Combobox case CB11: Field and Signal Forms. Controls the tests use as script actions are buttons.

type Planet = { readonly id: number; readonly name: string };

const planets: readonly Planet[] = [
  { id: 1, name: "Mercury" },
  { id: 2, name: "Venus" },
  { id: 3, name: "Earth" },
  { id: 4, name: "Mars" },
];

function matches(query: string): Planet[] {
  const found: Planet[] = [];

  for (const planet of planets) {
    if (planet.name.toLowerCase().startsWith(query.trim().toLowerCase())) {
      found.push(planet);
    }
  }

  return found;
}

const listStyles = `
  .list { color: inherit; background: #222222; border: 1px solid #555555; padding: 4px; margin: 0;
    min-inline-size: var(--og-anchor-width); box-sizing: border-box; }
  [ogComboboxOption] { padding: 2px 8px; }
  [ogComboboxOption][data-active] { background: #444466; }
`;

/**
 * A consumer component that is the Combobox through `hostDirectives`, exposing the value and query
 * models, `disabled` and `touch`, so `[formField]` on it finds the Combobox's value model. Signal
 * Forms calls `focus()` on the control it found, this component, so it forwards to the Combobox.
 */
@Component({
  selector: "[planetPicker]",
  hostDirectives: [
    {
      directive: OrigamiCombobox,
      inputs: ["value", "query", "disabled"],
      outputs: ["valueChange", "queryChange", "touch"],
    },
  ],
  imports: [OrigamiComboboxInput, OrigamiComboboxContent, OrigamiComboboxOption],
  template: `
    <input ogComboboxInput data-testid="wrapped-input" />
    <div ogComboboxContent data-testid="wrapped-content" class="list">
      @for (planet of found(); track planet.id) {
        <div
          ogComboboxOption
          [value]="planet.id"
          [label]="planet.name"
          [attr.data-testid]="'wrapped-' + planet.id"
        >
          {{ planet.name }}
        </div>
      }
    </div>
  `,
  styles: listStyles,
})
export class PlanetPicker {
  readonly combobox = inject<OrigamiCombobox<number>>(OrigamiCombobox);
  readonly found = computed(() => matches(this.combobox.state.query()));

  focus(options?: FocusOptions): void {
    this.combobox.focus(options);
  }
}

@Component({
  selector: "combobox-field-cases",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiCombobox,
    OrigamiComboboxInput,
    OrigamiComboboxContent,
    OrigamiComboboxOption,
    PlanetPicker,
  ],
  template: `
    <section>
      <h2>Signal Forms</h2>
      <div ogField #planetField="ogField" data-testid="planet-field">
        <label ogFieldLabel data-testid="planet-label">Planet</label>
        <div ogCombobox #planet="ogCombobox" [formField]="trip.planet" [(query)]="planetQuery">
          <input ogComboboxInput data-testid="planet-input" />
          <div ogComboboxContent data-testid="planet-content" class="list">
            @for (item of planetMatches(); track item.id) {
              <div
                ogComboboxOption
                [value]="item.id"
                [label]="item.name"
                [attr.data-testid]="'planet-' + item.id"
              >
                {{ item.name }}
              </div>
            }
          </div>
        </div>
        <p ogFieldDescription data-testid="planet-description">Where to?</p>
        @if (planetField.state.errorsShown()) {
          <p ogFieldError data-testid="planet-error">{{ planetField.state.errors()[0]?.message }}</p>
        }
      </div>
      <button type="button" data-testid="planet-after">After the planet</button>
      <output data-testid="planet-state">{{ describe(model().planet) }}|{{ planetQuery() }}|{{ trip.planet().touched() }}|{{ trip.planet().dirty() }}</output>
      <button type="button" data-testid="planet-write" (click)="writeMars()">Write Mars</button>
      <button type="button" data-testid="planet-focus" (click)="trip.planet().focusBoundControl()">
        Focus the bound control
      </button>
      <button type="button" data-testid="planet-reset" (click)="resetPlanet()">Reset</button>
      <button type="button" data-testid="planet-submit" (click)="submitTrip()">Submit</button>
      <button type="button" data-testid="planet-readonly" (click)="planetFrozen.set(!planetFrozen())">
        Readonly
      </button>
      <button type="button" data-testid="planet-disabled" (click)="planetLocked.set(!planetLocked())">
        Disabled
      </button>
    </section>

    <section>
      <h2>Composed</h2>
      <div ogField>
        <label ogFieldLabel data-testid="wrapped-label">Wrapped planet</label>
        <div planetPicker [formField]="trip.wrapped" [(query)]="wrappedQuery"></div>
      </div>
      <output data-testid="wrapped-state">{{ describe(model().wrapped) }}|{{ wrappedQuery() }}|{{ trip.wrapped().touched() }}</output>
      <button type="button" data-testid="wrapped-focus" (click)="trip.wrapped().focusBoundControl()">
        Focus the wrapped control
      </button>
    </section>
  `,
  styles: listStyles,
})
export class ComboboxFieldCases {
  readonly planetFrozen = signal(false);
  readonly planetLocked = signal(false);
  readonly planetQuery = signal("");
  readonly wrappedQuery = signal("");
  readonly model = signal<{ planet: number | null; wrapped: number | null }>({
    planet: null,
    wrapped: null,
  });
  readonly trip = form(this.model, (path) => {
    required(path.planet, { message: "Choose a planet" });
    readonly(path.planet, () => this.planetFrozen());
    disabled(path.planet, () => this.planetLocked());
  });
  readonly planetMatches = computed(() => matches(this.planetQuery()));

  /** An external value write: the text stays until the consumer writes the query (C1). */
  writeMars(): void {
    this.model.update((value) => ({ ...value, planet: 4 }));
  }

  /** A reset clears the value; the consumer clears the text with it. */
  resetPlanet(): void {
    this.trip.planet().reset(null);
    this.planetQuery.set("");
  }

  async submitTrip(): Promise<void> {
    await submit(this.trip, async () => {});
  }

  describe(value: number | null): string {
    if (value === null) {
      return "null";
    }

    return `${typeof value}:${String(value)}`;
  }
}

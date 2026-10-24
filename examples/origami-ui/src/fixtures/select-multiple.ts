import { Component, signal } from "@angular/core";
import { FormField, disabled, form, minLength, readonly, required } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import {
  OrigamiSelectContent,
  OrigamiSelectMultiple,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";
import type { OrigamiSelectOptionRecord } from "@loozo/origami-ui/select";

// Select cases Z13–Z16: ogSelectMultiple. Controls the tests use as script actions are buttons.

function increment(value: number): number {
  return value + 1;
}

function flip(value: boolean): boolean {
  return !value;
}

type Topping = { readonly value: string; readonly label: string; readonly disabled: boolean };

/** Capers is disabled; Garlic can be removed. */
const toppings: readonly Topping[] = [
  { value: "olives", label: "Olives", disabled: false },
  { value: "basil", label: "Basil", disabled: false },
  { value: "capers", label: "Capers", disabled: true },
  { value: "garlic", label: "Garlic", disabled: false },
  { value: "mushroom", label: "Mushroom", disabled: false },
  { value: "onion", label: "Onion", disabled: false },
];

@Component({
  selector: "select-multiple-cases",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiSelectMultiple,
    OrigamiSelectTrigger,
    OrigamiSelectContent,
    OrigamiSelectOption,
  ],
  template: `
    <section>
      <h2>Toppings</h2>
      <div
        ogSelectMultiple
        #pick="ogSelectMultiple"
        [(value)]="toppingsValue"
        [(open)]="toppingsOpen"
        [disabled]="toppingsDisabled()"
        (valueChange)="toppingsOutputs.update(increment)"
      >
        <button ogSelectTrigger aria-label="Toppings" data-testid="toppings-trigger">
          @if (pick.state.value().length === 0) {
            Choose toppings
          } @else {
            {{ pick.state.value().length }} selected
          }
        </button>
        <div ogSelectContent data-testid="toppings-content" class="list">
          @for (topping of toppings; track topping.value) {
            @if (topping.value !== "garlic" || garlicShown()) {
              <div
                ogSelectOption
                [value]="topping.value"
                [label]="topping.label"
                [disabled]="topping.disabled"
                [attr.data-testid]="'toppings-' + topping.value"
              >
                {{ topping.label }}
              </div>
            }
          }
        </div>
      </div>
      <button type="button" data-testid="toppings-after">After the toppings</button>
      <output data-testid="toppings-value">{{ pick.state.value().join(",") }}</output>
      <output data-testid="toppings-selected">{{ labels(pick.state.selectedOptions()) }}</output>
      <output data-testid="toppings-outputs">{{ toppingsOutputs() }}</output>
      <output data-testid="toppings-open">{{ toppingsOpen() }} {{ pick.state.open() }}</output>
      <button type="button" data-testid="write-toppings" (click)="toppingsValue.set(['garlic', 'olives'])">
        Write Garlic and Olives
      </button>
      <button type="button" data-testid="clear-toppings" (click)="toppingsValue.set([])">
        Clear the toppings
      </button>
      <button type="button" data-testid="toggle-garlic" (click)="garlicShown.update(flip)">
        Toggle the Garlic option
      </button>
      <button type="button" data-testid="disable-toppings" (click)="toppingsDisabled.update(flip)">
        Toggle disabled
      </button>
      <button type="button" data-testid="open-toppings" (click)="toppingsOpen.set(true)">
        Open by a write
      </button>
    </section>

    <section>
      <h2 id="numbers-heading">Numbers</h2>
      <div ogSelectMultiple #numbers="ogSelectMultiple" [(value)]="numbersValue">
        <button ogSelectTrigger aria-labelledby="numbers-heading" data-testid="numbers-trigger">
          {{ labels(numbers.state.selectedOptions()) }}
        </button>
        <div ogSelectContent data-testid="numbers-content" class="list">
          <div ogSelectOption [value]="1" label="One" data-testid="numbers-1">One</div>
          <div ogSelectOption [value]="2" label="Two" data-testid="numbers-2">Two</div>
          <div ogSelectOption [value]="2" label="Two again" data-testid="numbers-2-again">
            Two again
          </div>
          <div ogSelectOption value="1" label="String one" data-testid="numbers-string-1">
            String one
          </div>
          @if (threeShown()) {
            <div ogSelectOption [value]="3" label="Three" data-testid="numbers-3">Three</div>
          }
          <div ogSelectOption [value]="nan" label="Not a number" data-testid="numbers-nan">
            Not a number
          </div>
        </div>
      </div>
      <output data-testid="numbers-value">{{ describe(numbers.state.value()) }}</output>
      <output data-testid="numbers-records">{{ records(numbers.state.selectedOptions()) }}</output>
      <button type="button" data-testid="toggle-three" (click)="threeShown.update(flip)">
        Toggle the Three option
      </button>
      <button type="button" data-testid="write-nan" (click)="numbersValue.set([nan])">
        Write NaN
      </button>
    </section>

    <section>
      <h2>Signal Forms</h2>
      <div ogField #labelsField="ogField" data-testid="labels-field">
        <span ogFieldLabel id="labels-label">Labels</span>
        <div ogSelectMultiple #labelsPick="ogSelectMultiple" [formField]="filters.labels">
          <button ogSelectTrigger data-testid="labels-trigger">
            {{ labels(labelsPick.state.selectedOptions()) || "Any label" }}
          </button>
          <div ogSelectContent data-testid="labels-content" class="list">
            <div ogSelectOption [value]="10" label="Bug" data-testid="labels-10">Bug</div>
            <div ogSelectOption [value]="20" label="Feature" data-testid="labels-20">Feature</div>
            <div ogSelectOption [value]="30" label="Docs" data-testid="labels-30">Docs</div>
          </div>
        </div>
        <p ogFieldDescription id="labels-description">Pick one or more.</p>
        @if (labelsField.state.errorsShown()) {
          <p ogFieldError id="labels-error">{{ labelsField.state.errors()[0]?.message }}</p>
        }
      </div>
      <button type="button" data-testid="labels-after">After the labels</button>
      <output data-testid="labels-value">{{ describe(model().labels) }}</output>
      <output data-testid="labels-touched">{{ filters.labels().touched() }}</output>
      <button type="button" data-testid="write-labels" (click)="writeLabels()">
        Write Docs and Bug
      </button>
      <button type="button" data-testid="clear-labels" (click)="clearLabels()">
        Clear the labels
      </button>
      <button type="button" data-testid="focus-labels" (click)="filters.labels().focusBoundControl()">
        Focus the labels control
      </button>
      <button type="button" data-testid="freeze-labels" (click)="labelsFrozen.update(flip)">
        Freeze the labels
      </button>
      <button type="button" data-testid="lock-labels" (click)="labelsLocked.update(flip)">
        Lock the labels
      </button>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    output {
      display: block;
    }
    .list {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      min-inline-size: var(--og-anchor-width);
    }
    [ogSelectOption] {
      padding: 2px 8px;
    }
    [ogSelectOption][data-active] {
      background: #444466;
    }
  `,
})
export class SelectMultipleCases {
  readonly increment = increment;
  readonly flip = flip;
  readonly toppings = toppings;

  readonly toppingsValue = signal<readonly string[]>(["onion", "anchovy", "basil"]);
  readonly toppingsOpen = signal(false);
  readonly toppingsDisabled = signal(false);
  readonly toppingsOutputs = signal(0);
  readonly garlicShown = signal(true);

  readonly numbersValue = signal<readonly number[]>([3, 9, 2]);
  readonly threeShown = signal(false);
  /** `NaN !== NaN`, so a NaN option never matches a NaN value. */
  readonly nan = Number.NaN;

  readonly labelsFrozen = signal(false);
  readonly labelsLocked = signal(false);
  readonly model = signal<{ labels: number[] }>({ labels: [] });
  readonly filters = form(this.model, (path) => {
    required(path.labels);
    minLength(path.labels, 1, { message: "Choose a label." });
    readonly(path.labels, () => this.labelsFrozen());
    disabled(path.labels, () => this.labelsLocked());
  });

  writeLabels(): void {
    this.model.set({ labels: [30, 10] });
  }

  clearLabels(): void {
    this.model.set({ labels: [] });
  }

  /** The records' labels, comma-separated. */
  labels(records: readonly OrigamiSelectOptionRecord[]): string {
    const labels: string[] = [];

    for (const record of records) {
      labels.push(record.label ?? String(record.value));
    }

    return labels.join(",");
  }

  /** The records as `value:label:disabled`, so types and duplicates read precisely. */
  records(records: readonly OrigamiSelectOptionRecord[]): string {
    const entries: string[] = [];

    for (const record of records) {
      entries.push(`${typeof record.value}:${String(record.value)}:${record.label}`);
    }

    return entries.join(",");
  }

  /** Values with their runtime types, so `"1"` and `1` read differently. */
  describe(values: readonly (string | number)[]): string {
    const entries: string[] = [];

    for (const value of values) {
      entries.push(`${typeof value}:${String(value)}`);
    }

    return entries.join(",");
  }
}

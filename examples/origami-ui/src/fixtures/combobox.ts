import { Component, computed, effect, signal } from "@angular/core";
import {
  OrigamiCombobox,
  OrigamiComboboxContent,
  OrigamiComboboxInput,
  OrigamiComboboxOption,
  OrigamiComboboxTrigger,
} from "@loozo/origami-ui/combobox";
import {
  OrigamiDialog,
  OrigamiDialogContent,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";
import { ComboboxFieldCases } from "./combobox-field";
import { ComboboxLifetimes } from "./combobox-lifetimes";
import { ComboboxPrecedenceExisting, ComboboxPrecedenceFactory } from "./combobox-precedence";

// Combobox cases CB1–CB21. Controls the tests use as script actions are buttons. The consumer
// filters the options by the query, as the Combobox leaves filtering to it.

function increment(value: number): number {
  return value + 1;
}

type Country = { readonly code: string; readonly name: string; readonly disabled: boolean };

/** Sixteen countries: Belgium is disabled. */
const countries: readonly Country[] = [
  { code: "al", name: "Albania", disabled: false },
  { code: "dz", name: "Algeria", disabled: false },
  { code: "ad", name: "Andorra", disabled: false },
  { code: "ao", name: "Angola", disabled: false },
  { code: "ar", name: "Argentina", disabled: false },
  { code: "am", name: "Armenia", disabled: false },
  { code: "at", name: "Austria", disabled: false },
  { code: "be", name: "Belgium", disabled: true },
  { code: "br", name: "Brazil", disabled: false },
  { code: "bg", name: "Bulgaria", disabled: false },
  { code: "ca", name: "Canada", disabled: false },
  { code: "cl", name: "Chile", disabled: false },
  { code: "cy", name: "Cyprus", disabled: false },
  { code: "dk", name: "Denmark", disabled: false },
  { code: "gr", name: "Greece", disabled: false },
  { code: "zw", name: "Zimbabwe", disabled: false },
];

type Customer = { readonly id: number; readonly name: string; readonly email: string };

const customers: readonly Customer[] = [
  { id: 1, name: "Alice Novak", email: "alice@example.com" },
  { id: 2, name: "Bianca Rossi", email: "bianca@example.com" },
  { id: 3, name: "Bilal Haddad", email: "bilal@example.com" },
  { id: 4, name: "Carmen Diaz", email: "carmen@example.com" },
  { id: 5, name: "Dimitri Petrov", email: "dimitri@example.com" },
];

const longOptions: readonly number[] = Array.from({ length: 111 }, (_, index) => index + 1);

/** Case-insensitive prefix match on the query, the consumer's filter. */
function starts(name: string, query: string): boolean {
  return name.toLowerCase().startsWith(query.trim().toLowerCase());
}

@Component({
  selector: "acceptance-combobox-fixture",
  imports: [
    OrigamiCombobox,
    OrigamiComboboxInput,
    OrigamiComboboxTrigger,
    OrigamiComboboxContent,
    OrigamiComboboxOption,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    ComboboxFieldCases,
    ComboboxPrecedenceFactory,
    ComboboxPrecedenceExisting,
    ComboboxLifetimes,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach combobox behavior
    </button>
    <output data-testid="fixture-attached" data-combobox-fixture-chunk>{{ attached() }}</output>

    <section>
      <h2>Country</h2>
      <form (submit)="submitted($event)">
        <button type="button" data-testid="before">Before</button>
        <div
          ogCombobox
          #country="ogCombobox"
          [(value)]="countryValue"
          [(query)]="countryQuery"
          [(open)]="countryOpen"
          [disabled]="countryDisabled()"
          (valueChange)="countryValueOutputs.update(increment)"
          (openChange)="countryOpenOutputs.update(increment); vetoOpen(country, $event)"
          (touch)="countryTouches.update(increment)"
          class="combobox"
        >
          <input ogComboboxInput data-testid="country-input" aria-label="Country" />
          <button ogComboboxTrigger data-testid="country-trigger" aria-label="Countries">▾</button>
          <div ogComboboxContent data-testid="country-content" class="list" [gap]="4">
            <div class="padding" data-testid="country-padding">Countries</div>
            @for (item of countryMatches(); track item.code) {
              <div
                ogComboboxOption
                [value]="item.code"
                [label]="item.name"
                [disabled]="item.disabled"
                [attr.data-testid]="'country-' + item.code"
              >
                {{ item.name }}
              </div>
            } @empty {
              <p data-testid="country-empty">No country matches “{{ countryQuery() }}”.</p>
            }
          </div>
        </div>
        <button type="button" data-testid="after">After</button>
        <button type="submit" data-testid="country-submit">Submit</button>
      </form>
      <output data-testid="country-value">{{ describe(country.state.value()) }}</output>
      <output data-testid="country-query">{{ country.state.query() }}</output>
      <output data-testid="country-open">{{ countryOpen() }} {{ country.state.open() }}</output>
      <output data-testid="country-value-outputs">{{ countryValueOutputs() }}</output>
      <output data-testid="country-open-outputs">{{ countryOpenOutputs() }}</output>
      <output data-testid="country-submits">{{ countrySubmits() }}</output>
      <output data-testid="country-touches">{{ countryTouches() }}</output>
      <button type="button" data-testid="write-cyprus" (click)="countryValue.set('cy')">
        Value Cyprus
      </button>
      <button type="button" data-testid="write-null" (click)="countryValue.set(null)">
        Value null
      </button>
      <button type="button" data-testid="write-query" (click)="countryQuery.set('Denmark')">
        Query Denmark
      </button>
      <button type="button" data-testid="open-country" (click)="countryOpen.set(true)">
        Open by model
      </button>
      <button type="button" data-testid="close-country" (click)="countryOpen.set(false)">
        Close by model
      </button>
      <button
        type="button"
        data-testid="toggle-country-disabled"
        (click)="countryDisabled.set(!countryDisabled())"
      >
        Disable or enable
      </button>
      <!-- Country, Customer search and Long list cancel each open while one of these is set. -->
      <button type="button" data-testid="veto-open" (click)="openVeto.set('now')">
        Cancel each open from openChange
      </button>
      <button type="button" data-testid="veto-open-later" (click)="openVeto.set('later')">
        Cancel each open a microtask later
      </button>
      <button type="button" data-testid="allow-open" (click)="openVeto.set('none')">
        Allow opens
      </button>
    </section>

    <section>
      <h2>Customer search</h2>
      <!-- Server-search-shaped: results arrive after a task and every result is a new option. -->
      <div
        ogCombobox
        #customer="ogCombobox"
        [(value)]="customerValue"
        [(query)]="customerQuery"
        (openChange)="vetoOpen(customer, $event)"
      >
        <input ogComboboxInput data-testid="customer-input" aria-label="Customer" />
        <button ogComboboxTrigger data-testid="customer-trigger" aria-label="Customers">▾</button>
        <div ogComboboxContent data-testid="customer-content" class="list">
          @for (item of customerResults(); track item) {
            <div
              ogComboboxOption
              [value]="item.id"
              [label]="item.name"
              [attr.data-testid]="'customer-' + item.id"
            >
              <strong>{{ item.name }}</strong> <small>{{ item.email }}</small>
            </div>
          }
        </div>
      </div>
      <output data-testid="customer-value">{{ describe(customer.state.value()) }}</output>
      <output data-testid="customer-query">{{ customer.state.query() }}</output>
      <output data-testid="customer-searches">{{ customerSearches() }}</output>
      <button type="button" data-testid="customer-refresh" (click)="refreshCustomers()">
        Refresh the results
      </button>
    </section>

    <section>
      <h2>Long list</h2>
      <div
        ogCombobox
        #long="ogCombobox"
        [(value)]="longValue"
        [(query)]="longQuery"
        (openChange)="vetoOpen(long, $event)"
      >
        <input ogComboboxInput data-testid="long-input" aria-label="Long" />
        <button ogComboboxTrigger data-testid="long-trigger" aria-label="Long options">▾</button>
        <div ogComboboxContent data-testid="long-content" class="list capped">
          @for (item of longOptions; track item) {
            <div
              ogComboboxOption
              [value]="item"
              [label]="'Option ' + item"
              [attr.data-testid]="'long-' + item"
            >
              Option {{ item }}
            </div>
          }
        </div>
      </div>
      <output data-testid="long-value">{{ describe(long.state.value()) }}</output>
      <div class="spacer"></div>
    </section>

    <section>
      <h2>Naming</h2>
      <div ogCombobox>
        <input
          ogComboboxInput
          data-testid="named-own-input"
          aria-label="Input name"
          autocomplete="on"
        />
        <div ogComboboxContent data-testid="named-own-content" aria-label="Own name" class="list">
          <div ogComboboxOption value="a">A</div>
        </div>
      </div>
      <h3 id="named-heading">Heading name</h3>
      <div ogCombobox>
        <input ogComboboxInput data-testid="named-heading-input" aria-labelledby="named-heading" />
        <div ogComboboxContent data-testid="named-heading-content" class="list">
          <div ogComboboxOption value="a">A</div>
        </div>
      </div>
      <div ogCombobox>
        <input ogComboboxInput data-testid="named-bound-input" [attr.aria-label]="boundName()" />
        <div ogComboboxContent data-testid="named-bound-content" class="list">
          <div ogComboboxOption value="a">A</div>
        </div>
      </div>
      <h3 id="named-input-heading">Input heading</h3>
      <h3 id="named-list-heading">List heading</h3>
      <div ogCombobox>
        <input
          ogComboboxInput
          data-testid="named-both-input"
          aria-labelledby="named-input-heading"
        />
        <div
          ogComboboxContent
          data-testid="named-both-content"
          aria-labelledby="named-list-heading"
          class="list"
        >
          <div ogComboboxOption value="a">A</div>
        </div>
      </div>
      <div ogCombobox>
        <input
          ogComboboxInput
          data-testid="named-mixed-input"
          aria-labelledby="named-input-heading"
        />
        <div ogComboboxContent data-testid="named-mixed-content" aria-label="Own name" class="list">
          <div ogComboboxOption value="a">A</div>
        </div>
      </div>
    </section>

    <section>
      <h2>Nesting</h2>
      <div ogDialog [(open)]="dialogOpen">
        <button ogDialogTrigger data-testid="dialog-trigger">Open the dialog</button>
        <dialog ogDialogContent data-testid="dialog-content" aria-label="Dialog">
          <p data-testid="dialog-inside">Inside the dialog</p>
          <div ogCombobox [(value)]="dialogValue" [(query)]="dialogQuery">
            <input ogComboboxInput data-testid="dialog-input" aria-label="Dialog country" />
            <div ogComboboxContent data-testid="dialog-list" class="list">
              @for (item of dialogMatches(); track item.code) {
                <div
                  ogComboboxOption
                  [value]="item.code"
                  [label]="item.name"
                  [attr.data-testid]="'dialog-' + item.code"
                >
                  {{ item.name }}
                </div>
              }
            </div>
          </div>
        </dialog>
      </div>
      <output data-testid="dialog-open">{{ dialogOpen() }}</output>
      <output data-testid="dialog-value">{{ describe(dialogValue()) }}</output>

      <div ogPopover [(open)]="popoverOpen">
        <button ogPopoverTrigger ogPopoverAnchor data-testid="popover-trigger">Filters</button>
        <div ogPopoverContent data-testid="popover-content" class="panel">
          <p data-testid="popover-inside">Inside the Popover</p>
          <div ogCombobox [(value)]="popoverValue" [(query)]="popoverQuery">
            <input ogComboboxInput data-testid="popover-input" aria-label="Popover country" />
            <div ogComboboxContent data-testid="popover-list" class="list">
              @for (item of popoverMatches(); track item.code) {
                <div
                  ogComboboxOption
                  [value]="item.code"
                  [label]="item.name"
                  [attr.data-testid]="'popover-' + item.code"
                >
                  {{ item.name }}
                </div>
              }
            </div>
          </div>
        </div>
      </div>
      <output data-testid="popover-open">{{ popoverOpen() }}</output>
      <output data-testid="popover-value">{{ describe(popoverValue()) }}</output>
    </section>

    <section>
      <h2>Reentry</h2>
      <!-- The consumer rewrites the query from inside queryChange: once for "Cyprus" and for "",
           and every text ending in "!" back to the text before it; one ending in "?" the same
           way, a microtask later. -->
      <div
        ogCombobox
        #reentry="ogCombobox"
        [(value)]="reentryValue"
        (queryChange)="rewrite(reentry, $event)"
      >
        <input ogComboboxInput data-testid="reentry-input" aria-label="Reentry" />
        <div ogComboboxContent data-testid="reentry-content" class="list">
          @for (item of reentryMatches(); track item.code) {
            <div
              ogComboboxOption
              [value]="item.code"
              [label]="item.name"
              [attr.data-testid]="'reentry-' + item.code"
            >
              {{ item.name }}
            </div>
          }
        </div>
      </div>
      <output data-testid="reentry-value">{{ describe(reentry.state.value()) }}</output>
      <output data-testid="reentry-query">{{ reentry.state.query() }}</output>
    </section>

    <combobox-field-cases />
    <combobox-precedence-factory />
    <combobox-precedence-existing />
    <combobox-lifetimes />
  `,
  styles: `
    :host {
      display: block;
      color: #eeeeee;
      background: #181818;
      padding: 16px;
    }
    section {
      margin-block: 16px;
    }
    output {
      display: block;
    }
    .list {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      margin: 0;
      min-inline-size: var(--og-anchor-width);
      box-sizing: border-box;
    }
    .capped {
      max-block-size: 200px;
      overflow-y: auto;
    }
    .padding {
      block-size: 20px;
      font-size: 12px;
    }
    .panel {
      color: inherit;
      background: #333333;
      border: 1px solid #777777;
      padding: 8px;
      margin: 0;
    }
    [ogComboboxOption] {
      padding: 2px 8px;
    }
    [ogComboboxOption][data-active] {
      background: #444466;
    }
    [ogComboboxOption][data-selected] {
      font-weight: 600;
    }
    [ogComboboxOption][data-disabled] {
      opacity: 0.5;
    }
    dialog {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }
    .spacer {
      block-size: 200vh;
    }
  `,
})
export class ComboboxFixture {
  readonly increment = increment;
  readonly longOptions = longOptions;
  readonly attached = signal(false);

  readonly countryValue = signal<string | null>("gr");
  readonly countryQuery = signal("Greece");
  readonly countryOpen = signal(false);
  readonly countryDisabled = signal(false);
  readonly countryValueOutputs = signal(0);
  readonly countryOpenOutputs = signal(0);
  readonly countrySubmits = signal(0);
  readonly countryTouches = signal(0);
  /**
   * Whether the Country, Customer search and Long list consumers cancel each open, from
   * `openChange` or a microtask later.
   */
  readonly openVeto = signal<"none" | "now" | "later">("none");
  /** Every country while the input shows the chosen one's name, else the matches. */
  readonly countryMatches = computed(() => {
    const query = this.countryQuery();

    for (const country of countries) {
      if (country.code === this.countryValue() && country.name === query) {
        return countries;
      }
    }

    return this.#matches(query);
  });

  readonly customerValue = signal<number | null>(2);
  readonly customerQuery = signal("Bianca Rossi");
  readonly customerResults = signal<readonly Customer[]>([]);
  readonly customerSearches = signal(0);

  readonly longValue = signal<number | null>(80);
  readonly longQuery = signal("Option 80");

  readonly boundName = signal("Bound name");

  readonly dialogOpen = signal(false);
  readonly dialogValue = signal<string | null>(null);
  readonly dialogQuery = signal("");
  readonly dialogMatches = computed(() => this.#matches(this.dialogQuery()));
  readonly popoverOpen = signal(false);
  readonly popoverValue = signal<string | null>(null);
  readonly popoverQuery = signal("");
  readonly popoverMatches = computed(() => this.#matches(this.popoverQuery()));
  readonly reentryValue = signal<string | null>(null);
  readonly reentryQuery = signal("");
  readonly reentryMatches = computed(() => this.#matches(this.reentryQuery()));
  /** The texts the reentry consumer still rewrites, each once, to the text it maps to. */
  readonly #rewrites = new Map([
    ["Cyprus", "CYPRUS"],
    ["", "Any"],
  ]);

  constructor() {
    // A search per query, answered after a task, every answer a new array of new records.
    effect((onCleanup) => {
      const query = this.customerQuery();
      const timer = setTimeout(() => {
        const results: Customer[] = [];

        for (const customer of customers) {
          if (starts(customer.name, query)) {
            results.push({ ...customer });
          }
        }

        this.customerResults.set(results);
        this.customerSearches.update(increment);
      }, 0);

      onCleanup(() => clearTimeout(timer));
    });
  }

  /** New records for the same results: every option unmounts and a new one mounts. */
  refreshCustomers(): void {
    const results: Customer[] = [];

    for (const customer of this.customerResults()) {
      results.push({ ...customer });
    }

    this.customerResults.set(results);
  }

  /**
   * A consumer that rewrites the query from inside `queryChange`, synchronously, while the
   * Combobox is still writing it: each mapped text once, and a trailing "!" every time, rejected by
   * writing back the text before it. A trailing "?" is rejected the same way a microtask later,
   * after the input's own handler and before the next render.
   */
  rewrite(box: OrigamiCombobox<string>, text: string): void {
    if (text.endsWith("!")) {
      box.query.set(text.slice(0, -1));

      return;
    }

    if (text.endsWith("?")) {
      queueMicrotask(() => box.query.set(text.slice(0, -1)));

      return;
    }

    const rewrite = this.#rewrites.get(text);

    if (rewrite !== undefined) {
      this.#rewrites.delete(text);
      box.query.set(rewrite);

      return;
    }

    this.reentryQuery.set(text);
  }

  /**
   * A consumer that cancels an open by writing the root's `open` false, synchronously from inside
   * `openChange` or a microtask later, either way before the list renders open.
   */
  vetoOpen(box: OrigamiCombobox<string> | OrigamiCombobox<number>, open: boolean): void {
    if (!open || this.openVeto() === "none") {
      return;
    }

    if (this.openVeto() === "now") {
      box.open.set(false);
    } else {
      queueMicrotask(() => box.open.set(false));
    }
  }

  submitted(event: Event): void {
    event.preventDefault();
    this.countrySubmits.update(increment);
  }

  /** A value with its runtime type, so `"1"` and `1` read differently. */
  describe(value: string | number | boolean | null): string {
    if (value === null) {
      return "null";
    }

    return `${typeof value}:${String(value)}`;
  }

  #matches(query: string): readonly Country[] {
    const matches: Country[] = [];

    for (const country of countries) {
      if (starts(country.name, query)) {
        matches.push(country);
      }
    }

    return matches;
  }
}

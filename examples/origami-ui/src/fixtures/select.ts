import { Component, signal } from "@angular/core";
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
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";
import { SelectFieldCases } from "./select-field";
import { SelectPrecedenceExisting, SelectPrecedenceFactory } from "./select-precedence";

// Select cases Z1–Z12. Controls the tests use as script actions are buttons.

function increment(value: number): number {
  return value + 1;
}

type Fruit = { readonly value: string; readonly label: string | null; readonly disabled: boolean };

/** Fifteen fruits: Cherry is disabled, and Fig has no `label`, so typeahead reads its text. */
const fruits: readonly Fruit[] = [
  { value: "apple", label: "Apple", disabled: false },
  { value: "apricot", label: "Apricot", disabled: false },
  { value: "banana", label: "Banana", disabled: false },
  { value: "blueberry", label: "Blueberry", disabled: false },
  { value: "cherry", label: "Cherry", disabled: true },
  { value: "date", label: "Date", disabled: false },
  { value: "elderberry", label: "Elderberry", disabled: false },
  { value: "fig", label: null, disabled: false },
  { value: "grape", label: "Grape", disabled: false },
  { value: "guava", label: "Guava", disabled: false },
  { value: "lemon", label: "Lemon", disabled: false },
  { value: "lime", label: "Lime", disabled: false },
  { value: "mango", label: "Mango", disabled: false },
  { value: "navel-orange", label: "Navel orange", disabled: false },
  { value: "papaya", label: "Papaya", disabled: false },
];

const longOptions: readonly number[] = Array.from({ length: 111 }, (_, index) => index + 1);

@Component({
  selector: "acceptance-select-fixture",
  imports: [
    OrigamiSelect,
    OrigamiSelectTrigger,
    OrigamiSelectContent,
    OrigamiSelectOption,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    SelectPrecedenceFactory,
    SelectPrecedenceExisting,
    SelectFieldCases,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach select behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Fruit</h2>
      <button type="button" data-testid="before">Before</button>
      <div
        ogSelect
        #fruit="ogSelect"
        [(value)]="fruitValue"
        [(open)]="fruitOpen"
        [disabled]="fruitDisabled()"
        (valueChange)="fruitOutputs.update(increment)"
        (openChange)="fruitOpenOutputs.update(increment)"
      >
        <button ogSelectTrigger data-testid="fruit-trigger" aria-label="Fruit">
          {{ fruit.state.selectedOption()?.label ?? fruit.state.value() ?? "Choose a fruit" }}
        </button>
        <div ogSelectContent data-testid="fruit-content" class="list" [gap]="4">
          @for (item of fruitOptions(); track item.value) {
            <div
              ogSelectOption
              [value]="item.value"
              [label]="item.label"
              [disabled]="item.disabled"
              [attr.data-testid]="'fruit-' + item.value"
            >
              {{ item.label ?? "Fig" }}
            </div>
          }
        </div>
      </div>
      <button type="button" data-testid="after">After</button>
      <output data-testid="fruit-value">{{ describe(fruit.state.value()) }}</output>
      <output data-testid="fruit-outputs">{{ fruitOutputs() }}</output>
      <output data-testid="fruit-open">{{ fruitOpen() }} {{ fruit.state.open() }}</output>
      <output data-testid="fruit-open-outputs">{{ fruitOpenOutputs() }}</output>
      <output data-testid="fruit-selected">{{ record(fruit.state.selectedOption()) }}</output>
      <button type="button" data-testid="write-banana" (click)="fruitValue.set('banana')">
        Banana
      </button>
      <button type="button" data-testid="write-kiwi" (click)="fruitValue.set('kiwi')">Kiwi</button>
      <button type="button" data-testid="write-null" (click)="fruitValue.set(null)">None</button>
      <button type="button" data-testid="open-fruit" (click)="fruitOpen.set(true)">
        Open by model
      </button>
      <button type="button" data-testid="toggle-banana" (click)="toggleBanana()">
        Remove or restore Banana
      </button>
      <button
        type="button"
        data-testid="toggle-fruit-disabled"
        (click)="fruitDisabled.set(!fruitDisabled())"
      >
        Disable or enable
      </button>
    </section>

    <section>
      <h2>Numbers and booleans</h2>
      <div
        ogSelect
        #count="ogSelect"
        [(value)]="countValue"
        (valueChange)="countOutputs.update(increment)"
      >
        <button ogSelectTrigger data-testid="count-trigger" aria-label="Count">
          {{ count.state.value() ?? "None" }}
        </button>
        <div ogSelectContent data-testid="count-content" class="list">
          <div ogSelectOption [value]="1" label="One" data-testid="count-1">One</div>
          <div ogSelectOption [value]="2" label="Two" data-testid="count-2">Two</div>
          <!-- R1's pitfall: a string "1" never matches the number 1. -->
          <div ogSelectOption value="1" label="String one" data-testid="count-string-1">
            String one
          </div>
        </div>
      </div>
      <output data-testid="count-value">{{ describe(count.state.value()) }}</output>
      <output data-testid="count-outputs">{{ countOutputs() }}</output>
      <output data-testid="count-selected">{{ record(count.state.selectedOption()) }}</output>
      <button type="button" data-testid="write-count-1" (click)="countValue.set(1)">Write 1</button>

      <div ogSelect #agree="ogSelect" [(value)]="agreeValue">
        <button ogSelectTrigger data-testid="agree-trigger" aria-label="Agree">
          {{ agree.state.selectedOption()?.label ?? "Undecided" }}
        </button>
        <div ogSelectContent data-testid="agree-content" class="list">
          <div ogSelectOption [value]="true" label="Yes" data-testid="agree-yes">Yes</div>
          <div ogSelectOption [value]="false" label="No" data-testid="agree-no">No</div>
        </div>
      </div>
      <output data-testid="agree-value">{{ describe(agree.state.value()) }}</output>
    </section>

    <section>
      <h2>Options arriving later</h2>
      <div ogSelect #late="ogSelect" [(value)]="lateValue">
        <button ogSelectTrigger data-testid="late-trigger" aria-label="Late">
          {{ late.state.selectedOption()?.label ?? "Loading" }}
        </button>
        <div ogSelectContent data-testid="late-content" class="list">
          @if (lateLoaded()) {
            <div ogSelectOption value="x" label="Ex" data-testid="late-x">Ex</div>
            <div ogSelectOption value="y" label="Why first" data-testid="late-y1">Why first</div>
            <div ogSelectOption value="y" label="Why second" disabled data-testid="late-y2">
              Why second
            </div>
            <div ogSelectOption value="z" data-testid="late-z">Zed without a label</div>
          }
        </div>
      </div>
      <output data-testid="late-value">{{ describe(late.state.value()) }}</output>
      <output data-testid="late-selected">{{ record(late.state.selectedOption()) }}</output>
      <button type="button" data-testid="toggle-late" (click)="lateLoaded.set(!lateLoaded())">
        Load or unload
      </button>
      <button type="button" data-testid="write-late-z" (click)="lateValue.set('z')">Zed</button>
      <button type="button" data-testid="write-late-q" (click)="lateValue.set('q')">Q</button>
      <button type="button" data-testid="write-late-null" (click)="lateValue.set(null)">
        None
      </button>
    </section>

    <section>
      <h2>Long list</h2>
      <div ogSelect #long="ogSelect" [(value)]="longValue">
        <button ogSelectTrigger data-testid="long-trigger" aria-label="Long list">
          {{ long.state.value() }}
        </button>
        <div ogSelectContent data-testid="long-content" class="list capped">
          @for (n of longOptions; track n) {
            <div ogSelectOption [value]="'option-' + n" [attr.data-testid]="'long-' + n">
              Option {{ n }}
            </div>
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Nesting</h2>
      <div ogDialog [(open)]="dialogOpen">
        <button ogDialogTrigger data-testid="dialog-trigger">Open dialog</button>
        <dialog ogDialogContent data-testid="dialog-content">
          <div ogSelect [(value)]="dialogValue" [(open)]="dialogSelectOpen">
            <button ogSelectTrigger data-testid="dialog-select-trigger" aria-label="In dialog">
              {{ dialogValue() ?? "Choose" }}
            </button>
            <div ogSelectContent data-testid="dialog-select-content" class="list">
              <div ogSelectOption value="one" data-testid="dialog-option-one">One</div>
              <div ogSelectOption value="two" data-testid="dialog-option-two">Two</div>
            </div>
          </div>
          <p data-testid="dialog-inside">Inside the dialog</p>
        </dialog>
      </div>
      <output data-testid="dialog-state">{{ dialogOpen() }} {{ dialogSelectOpen() }}</output>

      <div ogPopover [(open)]="popoverOpen">
        <button ogPopoverTrigger ogPopoverAnchor data-testid="popover-trigger">Filters</button>
        <div ogPopoverContent data-testid="popover-content" class="panel" [gap]="4">
          <div ogSelect [(value)]="popoverValue" [(open)]="popoverSelectOpen">
            <button ogSelectTrigger data-testid="popover-select-trigger" aria-label="In popover">
              {{ popoverValue() ?? "Choose" }}
            </button>
            <div ogSelectContent data-testid="popover-select-content" class="list">
              <div ogSelectOption value="one" data-testid="popover-option-one">One</div>
              <div ogSelectOption value="two" data-testid="popover-option-two">Two</div>
            </div>
          </div>
          <p data-testid="popover-inside">Inside the popover</p>
        </div>
      </div>
      <output data-testid="popover-state">{{ popoverOpen() }} {{ popoverSelectOpen() }}</output>
      <button type="button" data-testid="close-popover" (click)="popoverOpen.set(false)">
        Close the popover by model
      </button>
      <button type="button" data-testid="open-popover" (click)="popoverOpen.set(true)">
        Open the popover by model
      </button>

      <div ogTooltip [(open)]="tipOpen" [openDelay]="0">
        <div ogSelect [(value)]="sortValue" [(open)]="sortOpen">
          <button ogSelectTrigger ogTooltipTrigger data-testid="tip-trigger" aria-label="Sort">
            {{ sortValue() }}
          </button>
          <div ogSelectContent data-testid="tip-select-content" class="list">
            <div ogSelectOption value="newest" data-testid="sort-newest">Newest</div>
            <div ogSelectOption value="oldest" data-testid="sort-oldest">Oldest</div>
          </div>
        </div>
        <div ogTooltipContent data-testid="tip-content" class="panel">Sort order</div>
      </div>
      <output data-testid="tip-state">{{ tipOpen() }} {{ sortOpen() }}</output>
    </section>

    <section>
      <h2>Deferred options</h2>
      <div
        ogSelect
        #deferred="ogSelect"
        [(value)]="deferredValue"
        (valueChange)="deferredOutputs.update(increment)"
      >
        <button ogSelectTrigger data-testid="deferred-trigger" aria-label="Deferred">
          {{ deferred.state.value() ?? "Choose" }}
        </button>
        <div ogSelectContent data-testid="deferred-content" class="list">
          <div ogSelectOption value="early" data-testid="deferred-early">Early</div>
          @defer (hydrate when deferredHydrated()) {
            <div ogSelectOption value="late-1" data-testid="deferred-late-1">Late one</div>
            <div ogSelectOption value="late-2" data-testid="deferred-late-2">Late two</div>
            <output data-testid="deferred-block-attached">{{ attached() }}</output>
          } @placeholder {
            <span>Loading more</span>
          }
        </div>
      </div>
      <output data-testid="deferred-value">{{ describe(deferred.state.value()) }}</output>
      <output data-testid="deferred-outputs">{{ deferredOutputs() }}</output>
      <button type="button" data-testid="hydrate-deferred" (click)="deferredHydrated.set(true)">
        Hydrate the late options
      </button>
    </section>

    <section>
      <h2>Replaced Options over host-composed parts</h2>
      <select-precedence-factory />
      <select-precedence-existing />
    </section>

    <select-field-cases />

    <div class="spacer"></div>
  `,
  styles: `
    .list {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      min-inline-size: var(--og-anchor-width);
    }
    .capped {
      max-block-size: min(200px, var(--og-available-height, 200px));
      overflow-y: auto;
    }
    .panel {
      color: inherit;
      background: #333333;
      border: 1px solid #777777;
      padding: 8px;
    }
    [ogSelectOption] {
      padding: 2px 8px;
    }
    [ogSelectOption][data-active] {
      background: #444466;
    }
    [ogSelectOption][data-selected] {
      font-weight: 600;
    }
    [ogSelectOption][data-disabled] {
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
export class SelectFixture {
  readonly increment = increment;
  readonly longOptions = longOptions;
  readonly attached = signal(false);

  readonly fruitValue = signal<string | null>("banana");
  readonly fruitOpen = signal(false);
  readonly fruitDisabled = signal(false);
  readonly fruitOutputs = signal(0);
  readonly fruitOpenOutputs = signal(0);
  readonly fruitOptions = signal<readonly Fruit[]>(fruits);

  readonly countValue = signal<number | null>(null);
  readonly countOutputs = signal(0);
  readonly agreeValue = signal<boolean | null>(null);

  readonly lateValue = signal<string | null>("y");
  readonly lateLoaded = signal(false);

  readonly longValue = signal<string | null>("option-80");

  readonly dialogOpen = signal(false);
  readonly dialogValue = signal<string | null>(null);
  readonly dialogSelectOpen = signal(false);
  readonly popoverOpen = signal(false);
  readonly popoverValue = signal<string | null>(null);
  readonly popoverSelectOpen = signal(false);
  readonly tipOpen = signal(false);
  readonly sortValue = signal<string | null>("newest");
  readonly sortOpen = signal(false);

  readonly deferredValue = signal<string | null>(null);
  readonly deferredOutputs = signal(0);
  readonly deferredHydrated = signal(false);

  toggleBanana(): void {
    const current = this.fruitOptions();

    if (current.length === fruits.length) {
      const remaining: Fruit[] = [];

      for (const fruit of current) {
        if (fruit.value !== "banana") {
          remaining.push(fruit);
        }
      }

      this.fruitOptions.set(remaining);

      return;
    }

    this.fruitOptions.set(fruits);
  }

  /** A value with its runtime type, so `"1"` and `1` read differently. */
  describe(value: string | number | boolean | null): string {
    if (value === null) {
      return "null";
    }

    return `${typeof value}:${String(value)}`;
  }

  record(value: unknown): string {
    return JSON.stringify(value);
  }
}

import {
  Component,
  Directive,
  InjectionToken,
  Service,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectContentOptions,
  OrigamiSelectOption,
  OrigamiSelectOptionOptions,
  OrigamiSelectOptions,
  OrigamiSelectState,
  OrigamiSelectTrigger,
  OrigamiSelectTriggerOptions,
} from "@loozo/origami-ui/select";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";

// Z12 (O1, O3): consumers compose every Select part through `hostDirectives`, exposing its own
// inputs with contradicting values, and replace its Options with ordinary signals: by factories
// in one case and by existing providers in the other. Trigger and Content replace only the
// Select's Options, never the Popover's they compose.

const SelectCaseLabel = new InjectionToken<string>("select precedence case label");

type Size = { readonly code: number; readonly name: string; readonly disabled: boolean };

const sizes: readonly Size[] = [
  { code: 1, name: "One", disabled: false },
  { code: 2, name: "Two", disabled: false },
  { code: 3, name: "Three", disabled: true },
];

/** Ordinary non-model replacement signals shared only by one consumer root. */
@Service({ autoProvided: false })
export class SelectPrecedenceSettings {
  readonly label = inject(SelectCaseLabel);
  readonly value = signal<number | null>(2);
  readonly open = signal(false);
  readonly disabled = signal(true);
  // Element IDs that match between server and client: derived from the case, not allocated.
  readonly triggerId = signal(`${this.label}-trigger`);
  readonly triggerDisabled = signal(false);
  readonly focusableWhenDisabled = signal(false);
  readonly contentId = signal(`${this.label}-content`);
  readonly side = signal<OrigamiPopoverSide>("inline-end");
  readonly align = signal<OrigamiPopoverAlign>("center");
  readonly gap = signal(11);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  changeIds(): void {
    this.triggerId.set(`${this.triggerId()}-changed`);
    this.contentId.set(`${this.contentId()}-changed`);
  }
}

const rootComposition = {
  directive: OrigamiSelect,
  inputs: ["value", "open", "disabled"],
  outputs: ["valueChange", "openChange"],
};
const triggerComposition = {
  directive: OrigamiSelectTrigger,
  inputs: ["id", "disabled", "focusableWhenDisabled"],
};
const contentComposition = {
  directive: OrigamiSelectContent,
  inputs: ["id", "side", "align", "gap"],
};
const optionComposition = {
  directive: OrigamiSelectOption,
  inputs: ["value", "label", "disabled", "id"],
};

// ---- Factory providers ----

@Directive({
  selector: "[precedenceFactorySelect]",
  exportAs: "precedenceSelect",
  hostDirectives: [rootComposition],
  providers: [
    SelectPrecedenceSettings,
    OrigamiSelectOptions.provideFactory(() => inject(SelectPrecedenceSettings)),
  ],
})
export class PrecedenceFactorySelect {
  readonly settings = inject(SelectPrecedenceSettings);
  readonly state = inject<OrigamiSelectState<number>>(OrigamiSelectState);
}

@Directive({
  selector: "button[precedenceFactorySelectTrigger]",
  hostDirectives: [triggerComposition],
  providers: [
    OrigamiSelectTriggerOptions.provideFactory(() => {
      const settings = inject(SelectPrecedenceSettings);

      return {
        id: settings.triggerId,
        disabled: settings.triggerDisabled,
        focusableWhenDisabled: settings.focusableWhenDisabled,
      };
    }),
  ],
})
export class PrecedenceFactorySelectTrigger {}

@Directive({
  selector: "[precedenceFactorySelectContent]",
  hostDirectives: [contentComposition],
  providers: [
    OrigamiSelectContentOptions.provideFactory(() => {
      const settings = inject(SelectPrecedenceSettings);

      return {
        id: settings.contentId,
        side: settings.side,
        align: settings.align,
        gap: settings.gap,
      };
    }),
  ],
})
export class PrecedenceFactorySelectContent {}

/** An option whose effective Options come from its own required `size` input. */
@Directive({
  selector: "[precedenceFactorySelectOption]",
  hostDirectives: [optionComposition],
  providers: [
    OrigamiSelectOptionOptions.provideFactory(() => {
      const option = inject(PrecedenceFactorySelectOption);
      const label = inject(SelectCaseLabel);

      return {
        value: computed(() => option.size().code),
        label: computed(() => option.size().name),
        disabled: computed(() => option.size().disabled),
        id: computed(() => `${label}-option-${option.size().code}`),
      };
    }),
  ],
})
export class PrecedenceFactorySelectOption {
  readonly size = input.required<Size>();
}

// ---- Existing providers ----

@Directive({
  selector: "[precedenceExistingSelect]",
  exportAs: "precedenceSelect",
  hostDirectives: [rootComposition],
  providers: [
    SelectPrecedenceSettings,
    OrigamiSelectOptions.provideExisting(() => PrecedenceExistingSelect),
  ],
})
export class PrecedenceExistingSelect implements OrigamiSelectOptions<number> {
  readonly settings = inject(SelectPrecedenceSettings);
  readonly value = this.settings.value;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly state = inject<OrigamiSelectState<number>>(OrigamiSelectState);
}

@Directive({
  selector: "button[precedenceExistingSelectTrigger]",
  hostDirectives: [triggerComposition],
  providers: [OrigamiSelectTriggerOptions.provideExisting(() => PrecedenceExistingSelectTrigger)],
})
export class PrecedenceExistingSelectTrigger implements OrigamiSelectTriggerOptions {
  readonly #settings = inject(SelectPrecedenceSettings);
  readonly id = this.#settings.triggerId;
  readonly disabled = this.#settings.triggerDisabled;
  readonly focusableWhenDisabled = this.#settings.focusableWhenDisabled;
}

@Directive({
  selector: "[precedenceExistingSelectContent]",
  hostDirectives: [contentComposition],
  providers: [OrigamiSelectContentOptions.provideExisting(() => PrecedenceExistingSelectContent)],
})
export class PrecedenceExistingSelectContent implements OrigamiSelectContentOptions {
  readonly #settings = inject(SelectPrecedenceSettings);
  readonly id = this.#settings.contentId;
  readonly side = this.#settings.side;
  readonly align = this.#settings.align;
  readonly gap = this.#settings.gap;
}

/** An option whose effective Options come from its own required `size` input. */
@Directive({
  selector: "[precedenceExistingSelectOption]",
  hostDirectives: [optionComposition],
  providers: [OrigamiSelectOptionOptions.provideExisting(() => PrecedenceExistingSelectOption)],
})
export class PrecedenceExistingSelectOption implements OrigamiSelectOptionOptions<number> {
  readonly #label = inject(SelectCaseLabel);
  readonly size = input.required<Size>();
  readonly value = computed(() => this.size().code);
  readonly label = computed(() => this.size().name);
  readonly disabled = computed(() => this.size().disabled);
  readonly id = computed(() => `${this.#label}-option-${this.size().code}`);
}

// Every part exposes the composed directive's own inputs with values that contradict the
// replacement. Those inputs must remain unused while a replacement is present.
function selectTemplate(prefix: "precedenceFactorySelect" | "precedenceExistingSelect"): string {
  return `
  <div ${prefix} #root="precedenceSelect" [value]="1" [open]="true" [disabled]="false"
    (valueChange)="root.settings.unusedOutputs.update(root.settings.increment)"
    (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
    <button ${prefix}Trigger id="unused-direct-trigger" [disabled]="true" [focusableWhenDisabled]="true"
      class="anchor" aria-label="Size" data-co="trigger" [attr.data-testid]="root.settings.label + '-trigger'">
      {{ root.state.selectedOption()?.label ?? "Choose" }}
    </button>
    <div ${prefix}Content id="unused-direct-content" side="block-start" align="end" [gap]="99"
      class="surface" data-co="content" [attr.data-testid]="root.settings.label + '-content'">
      @for (size of sizes; track size.code) {
        <div ${prefix}Option [size]="size" [value]="99" label="Unused" [disabled]="!size.disabled"
          id="unused-direct-option" [attr.data-co]="'option-' + size.code">{{ size.name }}</div>
      }
    </div>
  </div>
  <output data-co="value">{{ describe(root.state.value()) }}</output>
  <output data-co="open">{{ root.settings.open() }} {{ root.state.open() }}</output>
  <output data-co="disabled">{{ root.state.disabled() }}</output>
  <output data-co="selected">{{ record(root.state.selectedOption()) }}</output>
  <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
  <button type="button" data-co="enable" (click)="root.settings.disabled.set(false)">Enable</button>
  <button type="button" data-co="trigger-disable"
    (click)="root.settings.triggerDisabled.set(!root.settings.triggerDisabled())">
    Disable the Trigger
  </button>
  <button type="button" data-co="ids" (click)="root.settings.changeIds()">IDs</button>
`;
}

const selectStyles = `
  :host { display: block; padding-block: 24px; }
  output { display: block; }
  .anchor { inline-size: 90px; block-size: 30px; margin-inline-start: 20px; }
  .surface { inline-size: 160px; block-size: 90px; box-sizing: border-box; margin: 0; padding: 4px;
    background: #242424; color: #eee; border: 1px solid #888; }
`;

/** Shared readouts of both cases. */
abstract class SelectPrecedenceCase {
  readonly sizes = sizes;

  /** A value with its runtime type. */
  describe(value: number | null): string {
    if (value === null) {
      return "null";
    }

    return `${typeof value}:${String(value)}`;
  }

  record(value: unknown): string {
    return JSON.stringify(value);
  }
}

@Component({
  selector: "select-precedence-factory",
  imports: [
    PrecedenceFactorySelect,
    PrecedenceFactorySelectTrigger,
    PrecedenceFactorySelectContent,
    PrecedenceFactorySelectOption,
  ],
  providers: [{ provide: SelectCaseLabel, useValue: "select-factory" }],
  host: { "data-case": "select-factory" },
  template: selectTemplate("precedenceFactorySelect"),
  styles: selectStyles,
})
export class SelectPrecedenceFactory extends SelectPrecedenceCase {}

@Component({
  selector: "select-precedence-existing",
  imports: [
    PrecedenceExistingSelect,
    PrecedenceExistingSelectTrigger,
    PrecedenceExistingSelectContent,
    PrecedenceExistingSelectOption,
  ],
  providers: [{ provide: SelectCaseLabel, useValue: "select-existing" }],
  host: { "data-case": "select-existing" },
  template: selectTemplate("precedenceExistingSelect"),
  styles: selectStyles,
})
export class SelectPrecedenceExisting extends SelectPrecedenceCase {}

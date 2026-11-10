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
  OrigamiCombobox,
  OrigamiComboboxContent,
  OrigamiComboboxContentOptions,
  OrigamiComboboxInput,
  OrigamiComboboxInputOptions,
  OrigamiComboboxOption,
  OrigamiComboboxOptionOptions,
  OrigamiComboboxOptions,
  OrigamiComboboxState,
  OrigamiComboboxTrigger,
  OrigamiComboboxTriggerOptions,
} from "@loozo/origami-ui/combobox";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";

// CB13 (O1, O3): consumers compose every Combobox part through `hostDirectives`, exposing its own
// inputs with contradicting values, and replace its Options with ordinary signals: by factories in
// one case and by existing providers in the other.

const ComboboxCaseLabel = new InjectionToken<string>("combobox precedence case label");

type Size = { readonly code: number; readonly name: string; readonly disabled: boolean };

const sizes: readonly Size[] = [
  { code: 1, name: "One", disabled: false },
  { code: 2, name: "Two", disabled: false },
  { code: 3, name: "Three", disabled: true },
];

/** Ordinary non-model replacement signals shared only by one consumer root. */
@Service({ autoProvided: false })
export class ComboboxPrecedenceSettings {
  readonly label = inject(ComboboxCaseLabel);
  readonly value = signal<number | null>(2);
  readonly query = signal("Two");
  readonly open = signal(false);
  readonly disabled = signal(true);
  // Element IDs that match between server and client: derived from the case, not allocated.
  readonly inputId = signal(`${this.label}-input`);
  readonly triggerId = signal(`${this.label}-trigger`);
  readonly contentId = signal(`${this.label}-content`);
  readonly side = signal<OrigamiPopoverSide>("inline-end");
  readonly align = signal<OrigamiPopoverAlign>("center");
  readonly gap = signal(11);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  changeIds(): void {
    this.inputId.set(`${this.inputId()}-changed`);
    this.triggerId.set(`${this.triggerId()}-changed`);
    this.contentId.set(`${this.contentId()}-changed`);
  }
}

const rootComposition = {
  directive: OrigamiCombobox,
  inputs: ["value", "query", "open", "disabled"],
  outputs: ["valueChange", "queryChange", "openChange"],
};
const inputComposition = { directive: OrigamiComboboxInput, inputs: ["id"] };
const triggerComposition = { directive: OrigamiComboboxTrigger, inputs: ["id"] };
const contentComposition = {
  directive: OrigamiComboboxContent,
  inputs: ["id", "side", "align", "gap"],
};
const optionComposition = {
  directive: OrigamiComboboxOption,
  inputs: ["value", "label", "disabled", "id"],
};

// ---- Factory providers ----

@Directive({
  selector: "[precedenceFactoryCombobox]",
  exportAs: "precedenceCombobox",
  hostDirectives: [rootComposition],
  providers: [
    ComboboxPrecedenceSettings,
    OrigamiComboboxOptions.provideFactory(() => inject(ComboboxPrecedenceSettings)),
  ],
})
export class PrecedenceFactoryCombobox {
  readonly settings = inject(ComboboxPrecedenceSettings);
  readonly state = inject<OrigamiComboboxState<number>>(OrigamiComboboxState);
}

@Directive({
  selector: "input[precedenceFactoryComboboxInput]",
  hostDirectives: [inputComposition],
  providers: [
    OrigamiComboboxInputOptions.provideFactory(() => ({
      id: inject(ComboboxPrecedenceSettings).inputId,
    })),
  ],
})
export class PrecedenceFactoryComboboxInput {}

@Directive({
  selector: "button[precedenceFactoryComboboxTrigger]",
  hostDirectives: [triggerComposition],
  providers: [
    OrigamiComboboxTriggerOptions.provideFactory(() => ({
      id: inject(ComboboxPrecedenceSettings).triggerId,
    })),
  ],
})
export class PrecedenceFactoryComboboxTrigger {}

@Directive({
  selector: "[precedenceFactoryComboboxContent]",
  hostDirectives: [contentComposition],
  providers: [
    OrigamiComboboxContentOptions.provideFactory(() => {
      const settings = inject(ComboboxPrecedenceSettings);

      return {
        id: settings.contentId,
        side: settings.side,
        align: settings.align,
        gap: settings.gap,
      };
    }),
  ],
})
export class PrecedenceFactoryComboboxContent {}

/** An option whose effective Options come from its own required `size` input. */
@Directive({
  selector: "[precedenceFactoryComboboxOption]",
  hostDirectives: [optionComposition],
  providers: [
    OrigamiComboboxOptionOptions.provideFactory(() => {
      const option = inject(PrecedenceFactoryComboboxOption);
      const label = inject(ComboboxCaseLabel);

      return {
        value: computed(() => option.size().code),
        label: computed(() => option.size().name),
        disabled: computed(() => option.size().disabled),
        id: computed(() => `${label}-option-${option.size().code}`),
      };
    }),
  ],
})
export class PrecedenceFactoryComboboxOption {
  readonly size = input.required<Size>();
}

// ---- Existing providers ----

@Directive({
  selector: "[precedenceExistingCombobox]",
  exportAs: "precedenceCombobox",
  hostDirectives: [rootComposition],
  providers: [
    ComboboxPrecedenceSettings,
    OrigamiComboboxOptions.provideExisting(() => PrecedenceExistingCombobox),
  ],
})
export class PrecedenceExistingCombobox implements OrigamiComboboxOptions<number> {
  readonly settings = inject(ComboboxPrecedenceSettings);
  readonly value = this.settings.value;
  readonly query = this.settings.query;
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly state = inject<OrigamiComboboxState<number>>(OrigamiComboboxState);
}

@Directive({
  selector: "input[precedenceExistingComboboxInput]",
  hostDirectives: [inputComposition],
  providers: [OrigamiComboboxInputOptions.provideExisting(() => PrecedenceExistingComboboxInput)],
})
export class PrecedenceExistingComboboxInput implements OrigamiComboboxInputOptions {
  readonly id = inject(ComboboxPrecedenceSettings).inputId;
}

@Directive({
  selector: "button[precedenceExistingComboboxTrigger]",
  hostDirectives: [triggerComposition],
  providers: [
    OrigamiComboboxTriggerOptions.provideExisting(() => PrecedenceExistingComboboxTrigger),
  ],
})
export class PrecedenceExistingComboboxTrigger implements OrigamiComboboxTriggerOptions {
  readonly id = inject(ComboboxPrecedenceSettings).triggerId;
}

@Directive({
  selector: "[precedenceExistingComboboxContent]",
  hostDirectives: [contentComposition],
  providers: [
    OrigamiComboboxContentOptions.provideExisting(() => PrecedenceExistingComboboxContent),
  ],
})
export class PrecedenceExistingComboboxContent implements OrigamiComboboxContentOptions {
  readonly #settings = inject(ComboboxPrecedenceSettings);
  readonly id = this.#settings.contentId;
  readonly side = this.#settings.side;
  readonly align = this.#settings.align;
  readonly gap = this.#settings.gap;
}

/** An option whose effective Options come from its own required `size` input. */
@Directive({
  selector: "[precedenceExistingComboboxOption]",
  hostDirectives: [optionComposition],
  providers: [OrigamiComboboxOptionOptions.provideExisting(() => PrecedenceExistingComboboxOption)],
})
export class PrecedenceExistingComboboxOption implements OrigamiComboboxOptionOptions<number> {
  readonly #label = inject(ComboboxCaseLabel);
  readonly size = input.required<Size>();
  readonly value = computed(() => this.size().code);
  readonly label = computed(() => this.size().name);
  readonly disabled = computed(() => this.size().disabled);
  readonly id = computed(() => `${this.#label}-option-${this.size().code}`);
}

// Every part exposes the composed directive's own inputs with values that contradict the
// replacement. Those inputs must remain unused while a replacement is present.
function comboboxTemplate(
  prefix: "precedenceFactoryCombobox" | "precedenceExistingCombobox",
): string {
  return `
  <div ${prefix} #root="precedenceCombobox" [value]="1" query="Unused" [open]="true" [disabled]="false"
    (valueChange)="root.settings.unusedOutputs.update(root.settings.increment)"
    (queryChange)="root.settings.unusedOutputs.update(root.settings.increment)"
    (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
    <input ${prefix}Input id="unused-direct-input" class="anchor" aria-label="Size"
      data-co="input" [attr.data-testid]="root.settings.label + '-input'" />
    <button ${prefix}Trigger id="unused-direct-trigger" aria-label="Sizes" data-co="trigger">▾</button>
    <div ${prefix}Content id="unused-direct-content" side="block-start" align="end" [gap]="99"
      class="surface" data-co="content" [attr.data-testid]="root.settings.label + '-content'">
      @for (size of sizes; track size.code) {
        <div ${prefix}Option [size]="size" [value]="99" label="Unused" [disabled]="!size.disabled"
          id="unused-direct-option" [attr.data-co]="'option-' + size.code">{{ size.name }}</div>
      }
    </div>
  </div>
  <output data-co="value">{{ describe(root.state.value()) }}</output>
  <output data-co="query">{{ root.state.query() }}</output>
  <output data-co="open">{{ root.settings.open() }} {{ root.state.open() }}</output>
  <output data-co="disabled">{{ root.state.disabled() }}</output>
  <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
  <button type="button" data-co="enable" (click)="root.settings.disabled.set(false)">Enable</button>
  <button type="button" data-co="ids" (click)="root.settings.changeIds()">IDs</button>
`;
}

const comboboxStyles = `
  :host { display: block; padding-block: 24px; }
  output { display: block; }
  .anchor { inline-size: 90px; block-size: 30px; margin-inline-start: 20px; }
  .surface { inline-size: 160px; block-size: 90px; box-sizing: border-box; margin: 0; padding: 4px;
    background: #242424; color: #eee; border: 1px solid #888; }
`;

/** Shared readouts of both cases. */
abstract class ComboboxPrecedenceCase {
  readonly sizes = sizes;

  /** A value with its runtime type. */
  describe(value: number | null): string {
    if (value === null) {
      return "null";
    }

    return `${typeof value}:${String(value)}`;
  }
}

@Component({
  selector: "combobox-precedence-factory",
  imports: [
    PrecedenceFactoryCombobox,
    PrecedenceFactoryComboboxInput,
    PrecedenceFactoryComboboxTrigger,
    PrecedenceFactoryComboboxContent,
    PrecedenceFactoryComboboxOption,
  ],
  providers: [{ provide: ComboboxCaseLabel, useValue: "combobox-factory" }],
  host: { "data-case": "combobox-factory" },
  template: comboboxTemplate("precedenceFactoryCombobox"),
  styles: comboboxStyles,
})
export class ComboboxPrecedenceFactory extends ComboboxPrecedenceCase {}

@Component({
  selector: "combobox-precedence-existing",
  imports: [
    PrecedenceExistingCombobox,
    PrecedenceExistingComboboxInput,
    PrecedenceExistingComboboxTrigger,
    PrecedenceExistingComboboxContent,
    PrecedenceExistingComboboxOption,
  ],
  providers: [{ provide: ComboboxCaseLabel, useValue: "combobox-existing" }],
  host: { "data-case": "combobox-existing" },
  template: comboboxTemplate("precedenceExistingCombobox"),
  styles: comboboxStyles,
})
export class ComboboxPrecedenceExisting extends ComboboxPrecedenceCase {}

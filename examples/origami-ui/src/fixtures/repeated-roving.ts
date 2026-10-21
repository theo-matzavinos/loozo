import { Component, Directive, input, signal } from "@angular/core";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsPanel,
  OrigamiTabsTrigger,
  OrigamiTabsTriggerOptions,
} from "@loozo/origami-ui/tabs";
import {
  OrigamiToggleGroupItem,
  OrigamiToggleGroupItemOptions,
  OrigamiToggleGroupMultiple,
} from "@loozo/origami-ui/toggle-group";
import { OrigamiToolbar, OrigamiToolbarItem } from "@loozo/origami-ui/toolbar";
import { OrigamiButtonOptions } from "@loozo/origami-ui/button";
import {
  OrigamiRadioGroup,
  OrigamiRadioGroupItem,
  OrigamiRadioGroupItemOptions,
} from "@loozo/origami-ui/radio-group";
import { injectUniqueId } from "@loozo/origami-ui/utils";

// S8 U7 K8 Q7 S9: repeated items whose replacement Options are required inputs, in all four
// roving widgets, and Tabs Panels rendered by a later `@for` with consumer-bound IDs. Rendered
// by the hydration unit and by the Node SSR checks.

/** Replacement Trigger Options whose value is a required input. */
@Directive({
  selector: "button[repeatedTab]",
  hostDirectives: [OrigamiTabsTrigger],
  providers: [OrigamiTabsTriggerOptions.provideExisting(() => RepeatedTab)],
})
export class RepeatedTab implements OrigamiTabsTriggerOptions {
  readonly value = input.required<string>();
  readonly id = input(injectUniqueId("repeated-tab"));
  readonly disabled = input(false);
  readonly focusableWhenDisabled = signal(false);
}

/** Replacement ToggleGroup item Options whose value is a required input. */
@Directive({
  selector: "button[repeatedMark]",
  hostDirectives: [OrigamiToggleGroupItem],
  providers: [OrigamiToggleGroupItemOptions.provideExisting(() => RepeatedMark)],
})
export class RepeatedMark implements OrigamiToggleGroupItemOptions {
  readonly value = input.required<string>();
  readonly disabled = input(false);
  readonly focusableWhenDisabled = signal(false);
  readonly id = input(injectUniqueId("repeated-mark"));
}

/** Replacement Toolbar item (Button) Options whose disabled state is a required input. */
@Directive({
  selector: "button[repeatedTool]",
  hostDirectives: [OrigamiToolbarItem],
  providers: [OrigamiButtonOptions.provideExisting(() => RepeatedTool)],
})
export class RepeatedTool implements OrigamiButtonOptions {
  readonly disabled = input.required<boolean>();
  readonly focusableWhenDisabled = signal(false);
}

/** Replacement RadioGroup item Options whose value is a required input. */
@Directive({
  selector: "button[repeatedRadio]",
  hostDirectives: [OrigamiRadioGroupItem],
  providers: [OrigamiRadioGroupItemOptions.provideExisting(() => RepeatedRadio)],
})
export class RepeatedRadio implements OrigamiRadioGroupItemOptions {
  readonly value = input.required<string>();
  readonly disabled = input(false);
  readonly focusableWhenDisabled = signal(false);
}

/** Each widget's preferred item, or for the Toolbar its first enabled one, is the third. */
@Component({
  selector: "acceptance-repeated-roving",
  imports: [
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsPanel,
    RepeatedTab,
    OrigamiToggleGroupMultiple,
    RepeatedMark,
    OrigamiToolbar,
    RepeatedTool,
    OrigamiRadioGroup,
    RepeatedRadio,
  ],
  template: `
    <div ogTabs [(value)]="tab" data-testid="repeated-tabs">
      <div ogTabsList aria-label="Repeated tabs">
        @for (key of keys; track key) {
          <button repeatedTab [value]="key" [attr.data-testid]="'repeated-tab-' + key">
            {{ key }}
          </button>
        }
      </div>
      @for (key of keys; track key) {
        <div
          ogTabsPanel
          [value]="key"
          [id]="label() + '-repeated-panel-' + key"
          [attr.data-testid]="'repeated-panel-' + key"
        >
          {{ key }} panel
        </div>
      }
    </div>
    <div
      ogToggleGroupMultiple
      [(value)]="marks"
      aria-label="Repeated marks"
      data-testid="repeated-marks"
    >
      @for (key of keys; track key) {
        <button repeatedMark [value]="key" [attr.data-testid]="'repeated-mark-' + key">
          {{ key }}
        </button>
      }
    </div>
    <div ogToolbar aria-label="Repeated tools" data-testid="repeated-tools">
      @for (key of keys; track key) {
        <button
          repeatedTool
          [disabled]="key !== 'three'"
          [attr.data-testid]="'repeated-tool-' + key"
        >
          {{ key }}
        </button>
      }
    </div>
    <div ogRadioGroup [(value)]="radio" aria-label="Repeated radios" data-testid="repeated-radios">
      @for (key of keys; track key) {
        <button repeatedRadio [value]="key" [attr.data-testid]="'repeated-radio-' + key">
          {{ key }}
        </button>
      }
    </div>
  `,
})
export class RepeatedRoving {
  /** Distinguishes the bound Panel IDs of several instances on one page. */
  readonly label = input.required<string>();
  readonly keys = ["one", "two", "three"];
  readonly tab = signal<string | null>("three");
  readonly marks = signal<readonly string[]>(["three"]);
  readonly radio = signal<string | null>("three");
}

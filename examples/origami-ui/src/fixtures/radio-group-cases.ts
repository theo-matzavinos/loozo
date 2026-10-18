import { ChangeDetectorRef, Component, inject, signal } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import { OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarPopoverTrigger,
  OrigamiToolbarRadioGroup,
  OrigamiToolbarToggleGroupMultiple,
} from "@loozo/origami-ui/toolbar";

// Q2 keyboard, reading direction, entry and moves onto the focused radio, the Q3 navigation
// targets whose own focus handler removes, disables or redirects them and the focus repair, and
// the Q4 Toolbar groups and a standalone group in Popover Content within a Toolbar, beside the core seed's RadioGroup. Each case is identified by
// `data-radio-case`.

@Component({
  selector: "acceptance-radio-group-cases",
  imports: [
    OrigamiRadioGroup,
    OrigamiRadioGroupItem,
    OrigamiToggleGroupItem,
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToolbarRadioGroup,
    OrigamiToolbarToggleGroupMultiple,
    OrigamiPopover,
    OrigamiToolbarPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
  ],
  template: `
    <h2>RadioGroup keyboard</h2>
    <button type="button" data-testid="radio-keyboard-before">Before the sizes</button>
    <div
      ogRadioGroup
      [(value)]="size"
      (valueChange)="sizeOutputs.update(increment)"
      aria-label="Size"
      data-radio-case="keyboard"
    >
      <button ogRadioGroupItem value="xs" data-role="xs">XS</button>
      <button ogRadioGroupItem value="s" data-role="s">S</button>
      <button ogRadioGroupItem value="m" disabled data-role="m">M</button>
      <button ogRadioGroupItem value="l" data-role="l">L</button>
      <output data-role="value">{{ size() }}</output>
      <output data-role="outputs">{{ sizeOutputs() }}</output>
    </div>
    <button type="button" data-testid="radio-keyboard-after">After the sizes</button>
    <button type="button" data-testid="radio-keyboard-clear" (click)="size.set(null)">
      Clear the size
    </button>

    <h2>A disabled checked radio</h2>
    <div ogRadioGroup [(value)]="locked" aria-label="Locked" data-radio-case="disabled-checked">
      <button ogRadioGroupItem value="first" disabled data-role="first">First</button>
      <button ogRadioGroupItem value="second" data-role="second">Second</button>
      <button ogRadioGroupItem value="third" data-role="third">Third</button>
      <output data-role="value">{{ locked() }}</output>
    </div>

    <h2>A RadioGroup with one enabled radio</h2>
    <div
      ogRadioGroup
      [(value)]="lone"
      (valueChange)="loneOutputs.update(increment)"
      aria-label="One enabled"
      data-radio-case="one-enabled"
    >
      <button ogRadioGroupItem value="first" disabled data-role="first">First</button>
      <button ogRadioGroupItem value="only" data-role="only">Only</button>
      <button ogRadioGroupItem value="third" disabled data-role="third">Third</button>
      <output data-role="value">{{ lone() }}</output>
      <output data-role="outputs">{{ loneOutputs() }}</output>
    </div>

    <h2>Right-to-left RadioGroup</h2>
    <div dir="rtl">
      <div ogRadioGroup [(value)]="rtl" aria-label="Right-to-left" data-radio-case="rtl">
        <button ogRadioGroupItem value="first" data-role="first">First</button>
        <button ogRadioGroupItem value="second" data-role="second">Second</button>
        <button ogRadioGroupItem value="third" data-role="third">Third</button>
        <output data-role="value">{{ rtl() }}</output>
      </div>
    </div>

    <h2>Navigation targets that change during focus</h2>
    <!-- Each target's focus handler runs inside the focus() call of an arrow key or a click's
      activation; detectChanges applies the removal or disabling before that call returns. -->
    <div
      ogRadioGroup
      [(value)]="vanish"
      (valueChange)="guardOutputs.update(increment)"
      aria-label="Removed during focus"
      data-radio-case="focus-vanish"
    >
      <button ogRadioGroupItem value="start" data-role="start">Start</button>
      @if (vanishMounted()) {
        <button
          ogRadioGroupItem
          value="target"
          data-role="target"
          (focus)="vanishMounted.set(false); changeDetector.detectChanges()"
        >
          Removed on focus
        </button>
      }
      <output data-role="value">{{ vanish() }}</output>
    </div>
    <div
      ogRadioGroup
      [(value)]="disable"
      (valueChange)="guardOutputs.update(increment)"
      aria-label="Disabled during focus"
      data-radio-case="focus-disable"
    >
      <button ogRadioGroupItem value="start" data-role="start">Start</button>
      <button
        ogRadioGroupItem
        value="target"
        [disabled]="targetDisabled()"
        data-role="target"
        (focus)="targetDisabled.set(true); changeDetector.detectChanges()"
      >
        Disabled on focus
      </button>
      <output data-role="value">{{ disable() }}</output>
    </div>
    <div
      ogRadioGroup
      [(value)]="redirect"
      (valueChange)="guardOutputs.update(increment)"
      aria-label="Redirected during focus"
      data-radio-case="focus-redirect"
    >
      <button ogRadioGroupItem value="start" data-role="start">Start</button>
      <button ogRadioGroupItem value="target" data-role="target" (focus)="redirectTarget.focus()">
        Redirected on focus
      </button>
      <output data-role="value">{{ redirect() }}</output>
    </div>
    <button type="button" #redirectTarget data-testid="radio-redirect-target">
      Redirect target
    </button>
    <output data-testid="radio-guard-outputs">{{ guardOutputs() }}</output>
    <button
      type="button"
      data-testid="radio-restore-targets"
      (click)="vanishMounted.set(true); targetDisabled.set(false)"
    >
      Restore focus targets
    </button>

    <h2>RadioGroup focus repair</h2>
    <div
      ogRadioGroup
      [(value)]="repair"
      (valueChange)="repairOutputs.update(increment); removeOnCheck($event)"
      aria-label="Repair"
      data-radio-case="repair"
    >
      @for (key of repairKeys(); track key) {
        <!-- Consumer-owned keys: Delete removes and D disables the focused radio. -->
        <button
          ogRadioGroupItem
          [value]="key"
          [disabled]="repairDisabled().includes(key)"
          [attr.data-role]="key"
          (keydown.delete)="removeRepair(key)"
          (keydown.d)="toggleRepairDisabled(key)"
        >
          {{ key }}
        </button>
      }
      <output data-role="value">{{ repair() }}</output>
      <output data-role="outputs">{{ repairOutputs() }}</output>
    </div>
    <button type="button" data-testid="radio-repair-outside">Outside the repair group</button>
    <button type="button" data-testid="radio-repair-remove-beta" (click)="removeRepair('beta')">
      Remove beta
    </button>
    <button type="button" data-testid="radio-repair-restore" (click)="restoreRepair()">
      Restore the repair group
    </button>

    <h2>RadioGroup in a Toolbar</h2>
    <div ogToolbar aria-label="Text formatting" data-radio-case="toolbar">
      <div ogToolbarToggleGroupMultiple [(value)]="marks" aria-label="Style" data-role="marks">
        <button ogToggleGroupItem value="bold" data-role="bold">Bold</button>
        <button ogToggleGroupItem value="italic" data-role="italic">Italic</button>
      </div>
      <div
        ogToolbarRadioGroup
        [(value)]="alignment"
        (valueChange)="alignmentOutputs.update(increment)"
        aria-label="Text alignment"
        data-role="alignment"
      >
        <button ogRadioGroupItem value="left" data-role="left">Left</button>
        <button ogRadioGroupItem value="center" data-role="center">Center</button>
        <button ogRadioGroupItem value="right" data-role="right">Right</button>
      </div>
      <button ogToolbarItem data-role="copy" (click)="copies.update(increment)">Copy</button>
      <output data-role="value">{{ alignment() }}</output>
      <output data-role="outputs">{{ alignmentOutputs() }}</output>
      <output data-role="copies">{{ copies() }}</output>
    </div>

    <h2>RadioGroup in a vertical Toolbar</h2>
    <div ogToolbar orientation="vertical" aria-label="Layout" data-radio-case="vertical-toolbar">
      <button ogToolbarItem data-role="top">Top</button>
      <div ogToolbarRadioGroup [(value)]="layout" aria-label="Columns" data-role="columns">
        <button ogRadioGroupItem value="one" data-role="one">One</button>
        <button ogRadioGroupItem value="two" data-role="two">Two</button>
      </div>
      <button ogToolbarItem data-role="bottom">Bottom</button>
      <output data-role="value">{{ layout() }}</output>
    </div>

    <h2>RadioGroup in Popover Content within a Toolbar</h2>
    <div ogToolbar aria-label="Spacing menu" data-radio-case="popover">
      <button ogToolbarItem data-role="before">Before</button>
      <span ogPopover [(open)]="spacingOpen">
        <button ogToolbarPopoverTrigger ogPopoverAnchor data-role="trigger">Spacing</button>
        <div ogPopoverContent role="group" aria-label="Spacing options" data-role="content">
          <div ogRadioGroup [(value)]="spacing" aria-label="Line spacing" data-role="spacing">
            <button ogRadioGroupItem value="single" data-role="single">Single</button>
            <button ogRadioGroupItem value="double" data-role="double">Double</button>
          </div>
        </div>
      </span>
      <button ogToolbarItem data-role="after">After</button>
      <output data-role="value">{{ spacing() }}</output>
    </div>
  `,
})
export class RadioGroupCases {
  readonly size = signal<string | null>(null);
  readonly sizeOutputs = signal(0);
  readonly locked = signal<string | null>("first");
  readonly lone = signal<string | null>(null);
  readonly loneOutputs = signal(0);
  readonly rtl = signal<string | null>("first");
  readonly vanish = signal<string | null>("start");
  readonly vanishMounted = signal(true);
  readonly disable = signal<string | null>("start");
  readonly targetDisabled = signal(false);
  readonly redirect = signal<string | null>("start");
  readonly guardOutputs = signal(0);
  readonly repair = signal<string | null>(null);
  readonly repairOutputs = signal(0);
  readonly repairKeys = signal(["alpha", "beta", "gamma", "doomed"]);
  readonly repairDisabled = signal<readonly string[]>([]);
  readonly marks = signal<readonly string[]>([]);
  readonly alignment = signal<string | null>("left");
  readonly alignmentOutputs = signal(0);
  readonly copies = signal(0);
  readonly layout = signal<string | null>("two");
  readonly spacingOpen = signal(false);
  readonly spacing = signal<string | null>("single");
  readonly increment = (value: number): number => value + 1;
  readonly changeDetector = inject(ChangeDetectorRef);

  /** A `valueChange` listener that removes the radio a selection just checked. */
  removeOnCheck(value: string | null): void {
    if (value === "doomed") {
      this.removeRepair("doomed");
    }
  }

  removeRepair(key: string): void {
    this.repairKeys.update((keys) => keys.filter((candidate) => candidate !== key));
  }

  toggleRepairDisabled(key: string): void {
    this.repairDisabled.update((keys) => {
      if (keys.includes(key)) {
        return keys.filter((candidate) => candidate !== key);
      }

      return [...keys, key];
    });
  }

  restoreRepair(): void {
    this.repair.set(null);
    this.repairKeys.set(["alpha", "beta", "gamma", "doomed"]);
    this.repairDisabled.set([]);
  }
}

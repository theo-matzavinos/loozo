import { ChangeDetectorRef, Component, Directive, inject, signal } from "@angular/core";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupMultiple,
  OrigamiToggleGroupItem,
  OrigamiToggleGroupState,
} from "@loozo/origami-ui/toggle-group";

// U3 vertical and reading direction, the U4 items whose own handlers remove or disable them during
// activation, and the U5 nested owner, beside the core seed's horizontal groups. Each case is
// identified by `data-toggle-group-case`.

@Directive({ selector: "[toggleGroupProbe]", exportAs: "toggleGroupProbe" })
export class ToggleGroupProbe {
  readonly state = inject(OrigamiToggleGroupState);
}

@Component({
  selector: "acceptance-toggle-group-cases",
  imports: [
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupMultiple,
    OrigamiToggleGroupItem,
    ToggleGroupProbe,
  ],
  template: `
    <h2>Vertical ToggleGroup</h2>
    <div
      ogToggleGroupSingle
      [(value)]="vertical"
      orientation="vertical"
      (valueChange)="verticalOutputs.update(increment)"
      aria-label="Panel layout"
      data-toggle-group-case="vertical"
    >
      <button ogToggleGroupItem value="list" data-role="list">List</button>
      <button ogToggleGroupItem value="grid" data-role="grid">Grid</button>
      <button ogToggleGroupItem value="columns" data-role="columns">Columns</button>
      <output data-role="value">{{ vertical() }}</output>
      <output data-role="outputs">{{ verticalOutputs() }}</output>
    </div>

    <h2>Right-to-left ToggleGroups</h2>
    <div dir="rtl">
      <div
        ogToggleGroupMultiple
        [(value)]="rtl"
        aria-label="Right-to-left"
        data-toggle-group-case="rtl"
      >
        <button ogToggleGroupItem value="first" data-role="first">First</button>
        <button ogToggleGroupItem value="second" data-role="second">Second</button>
        <button ogToggleGroupItem value="third" data-role="third">Third</button>
        <output data-role="value">{{ rtl() }}</output>
      </div>
      <div
        ogToggleGroupSingle
        [(value)]="rtlVertical"
        orientation="vertical"
        aria-label="Right-to-left vertical"
        data-toggle-group-case="rtl-vertical"
      >
        <button ogToggleGroupItem value="first" data-role="first">First</button>
        <button ogToggleGroupItem value="second" data-role="second">Second</button>
        <output data-role="value">{{ rtlVertical() }}</output>
      </div>
    </div>

    <h2>Items that change during activation</h2>
    <!-- The removing item's valueChange listener and the disabling item's focus handler run
      inside the click; detectChanges applies the change before the handler returns. -->
    <div
      ogToggleGroupSingle
      [(value)]="vanish"
      (valueChange)="
        vanishOutputs.update(increment); vanishMounted.set(false); changeDetector.detectChanges()
      "
      aria-label="Removed by its press"
      data-toggle-group-case="press-vanish"
    >
      <button ogToggleGroupItem value="start" data-role="start">Start</button>
      @if (vanishMounted()) {
        <button ogToggleGroupItem value="target" data-role="target">Removed when pressed</button>
      }
      <output data-role="value">{{ vanish() }}</output>
      <output data-role="outputs">{{ vanishOutputs() }}</output>
    </div>
    <div
      ogToggleGroupSingle
      [(value)]="disable"
      (valueChange)="disableOutputs.update(increment)"
      aria-label="Disabled during focus"
      data-toggle-group-case="focus-disable"
    >
      <button ogToggleGroupItem value="start" data-role="start">Start</button>
      <button
        ogToggleGroupItem
        value="target"
        [disabled]="targetDisabled()"
        data-role="target"
        (focus)="targetDisabled.set(true); changeDetector.detectChanges()"
      >
        Disabled on focus
      </button>
      <output data-role="value">{{ disable() }}</output>
      <output data-role="outputs">{{ disableOutputs() }}</output>
    </div>
    <button type="button" data-testid="restore-toggle-group-targets" (click)="restoreTargets()">
      Restore activation targets
    </button>

    <h2>Nested ToggleGroups</h2>
    <div
      ogToggleGroupSingle
      #outerGroup="ogToggleGroupSingle"
      [(value)]="outer"
      aria-label="Outer"
      data-toggle-group-case="nested"
    >
      <button ogToggleGroupItem value="a" data-role="outer-a">Outer A</button>
      <button ogToggleGroupItem value="b" data-role="outer-b">Outer B</button>
      <div>
        <div
          ogToggleGroupMultiple
          #innerGroup="ogToggleGroupMultiple"
          [(value)]="inner"
          orientation="vertical"
          aria-label="Inner"
          data-role="inner"
        >
          <button ogToggleGroupItem value="x" data-role="inner-x">Inner X</button>
          <button ogToggleGroupItem value="y" data-role="inner-y">Inner Y</button>
          <span toggleGroupProbe #innerProbe="toggleGroupProbe"></span>
          <output data-role="inner-shared">{{ innerGroup.state === innerProbe.state }}</output>
          <output data-role="independent">{{ innerGroup.state !== outerGroup.state }}</output>
        </div>
      </div>
      <output data-role="outer-value">{{ outer() }}</output>
      <output data-role="inner-value">{{ inner() }}</output>
    </div>
  `,
})
export class ToggleGroupCases {
  readonly vertical = signal<string | null>("list");
  readonly verticalOutputs = signal(0);
  readonly rtl = signal<readonly string[]>([]);
  readonly rtlVertical = signal<string | null>("first");
  readonly vanish = signal<string | null>("start");
  readonly vanishMounted = signal(true);
  readonly vanishOutputs = signal(0);
  readonly disable = signal<string | null>("start");
  readonly targetDisabled = signal(false);
  readonly disableOutputs = signal(0);
  readonly outer = signal<string | null>("a");
  readonly inner = signal<readonly string[]>([]);
  readonly increment = (value: number): number => value + 1;
  readonly changeDetector = inject(ChangeDetectorRef);

  restoreTargets(): void {
    this.vanish.set("start");
    this.vanishMounted.set(true);
    this.disable.set("start");
    this.targetDisabled.set(false);
  }
}

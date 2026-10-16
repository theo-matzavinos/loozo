import { ChangeDetectorRef, Component, Directive, computed, inject, signal } from "@angular/core";
import { OrigamiCollectionState } from "@loozo/origami-ui/collection";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupMultiple,
  OrigamiToggleGroupItem,
  OrigamiToggleGroupState,
} from "@loozo/origami-ui/toggle-group";
import { OrigamiToolbar, OrigamiToolbarItem } from "@loozo/origami-ui/toolbar";

// K2 keyboard, vertical and reading direction, the K3 joined groups, the K4 focus repair and the
// K7 Popover Content cut, beside the core seed's Toolbar. Each case is identified by
// `data-toolbar-case`.

/** The nearest Collection's values in order, read on a Toolbar host. */
@Directive({ selector: "[toolbarValues]", exportAs: "toolbarValues" })
export class ToolbarValues {
  readonly #state = inject(OrigamiCollectionState);
  readonly values = computed(() => {
    const values: string[] = [];

    for (const item of this.#state.items()) {
      values.push(item.value());
    }

    return values;
  });
}

/** A joined group's effective orientation, read from its State. */
@Directive({ selector: "[toolbarGroupProbe]", exportAs: "toolbarGroupProbe" })
export class ToolbarGroupProbe {
  readonly state = inject(OrigamiToggleGroupState);
}

/** A Single group rendered through a child component's own template inside a Toolbar. */
@Component({
  selector: "acceptance-toolbar-alignment",
  imports: [OrigamiToggleGroupSingle, OrigamiToggleGroupItem],
  template: `
    <div ogToggleGroupSingle [(value)]="alignment" aria-label="Alignment" data-role="alignment">
      <button ogToggleGroupItem value="left" data-role="left">Left</button>
      <button ogToggleGroupItem value="right" data-role="right">Right</button>
    </div>
    <output data-role="alignment-value">{{ alignment() }}</output>
  `,
})
export class ToolbarAlignment {
  readonly alignment = signal<string | null>("right");
}

@Component({
  selector: "acceptance-toolbar-cases",
  imports: [
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupMultiple,
    OrigamiToggleGroupItem,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    ToolbarValues,
    ToolbarGroupProbe,
    ToolbarAlignment,
  ],
  template: `
    <h2>Toolbar keyboard</h2>
    <div ogToolbar aria-label="Keyboard" data-toolbar-case="keyboard">
      <button ogToolbarItem data-role="first">First</button>
      <button ogToolbarItem disabled data-role="second">Second</button>
      <button ogToolbarItem data-role="third">Third</button>
      <button ogToolbarItem data-role="fourth">Fourth</button>
      <input aria-label="Find" value="find" data-role="find" />
    </div>

    <h2>Vertical Toolbar</h2>
    <div ogToolbar orientation="vertical" aria-label="Insert" data-toolbar-case="vertical">
      <button ogToolbarItem data-role="image">Image</button>
      <span role="separator"></span>
      <button ogToolbarItem data-role="table">Table</button>
      <button ogToolbarItem data-role="chart">Chart</button>
    </div>

    <h2>Right-to-left Toolbars</h2>
    <div dir="rtl">
      <div ogToolbar aria-label="Right-to-left" data-toolbar-case="rtl">
        <button ogToolbarItem data-role="first">First</button>
        <button ogToolbarItem data-role="second">Second</button>
        <button ogToolbarItem data-role="third">Third</button>
      </div>
      <div
        ogToolbar
        orientation="vertical"
        aria-label="Right-to-left vertical"
        data-toolbar-case="rtl-vertical"
      >
        <button ogToolbarItem data-role="first">First</button>
        <button ogToolbarItem data-role="second">Second</button>
      </div>
    </div>

    <h2>Toolbar with joined groups</h2>
    <div
      ogToolbar
      toolbarValues
      #joined="toolbarValues"
      aria-label="Clipboard and format"
      data-toolbar-case="joined"
    >
      @for (key of joinedKeys(); track key) {
        @if (key === "marks") {
          <div
            ogToggleGroupMultiple
            [(value)]="marks"
            [disabled]="marksDisabled()"
            orientation="vertical"
            (valueChange)="markOutputs.update(increment)"
            aria-label="Marks"
            data-role="marks"
          >
            <button ogToggleGroupItem value="b" data-role="b">B</button>
            <button ogToggleGroupItem value="i" data-role="i">I</button>
            <button ogToggleGroupItem value="u" data-role="u">U</button>
            <span toolbarGroupProbe #marksProbe="toolbarGroupProbe"></span>
            <output data-role="marks-orientation">{{ marksProbe.state.orientation() }}</output>
          </div>
        } @else {
          <button ogToolbarItem [attr.data-role]="key">{{ key }}</button>
        }
      }
      <acceptance-toolbar-alignment />
      <button ogToolbarItem data-role="paste">Paste</button>
      <output data-role="values">{{ joined.values().length }}:{{ knownValues(joined.values()) }}</output>
      <output data-role="marks-value">{{ marks().join(",") }}</output>
      <output data-role="mark-outputs">{{ markOutputs() }}</output>
    </div>
    <button type="button" data-testid="toolbar-joined-move" (click)="joinedKeys.set(['marks', 'cut', 'copy'])">
      Move the marks before Cut
    </button>
    <button type="button" data-testid="toolbar-marks-disable" (click)="marksDisabled.set(!marksDisabled())">
      Toggle marks disabled
    </button>
    <div ogToggleGroupSingle [(value)]="outside" aria-label="Outside" data-toolbar-case="outside-group">
      <button ogToggleGroupItem value="a" data-role="a">A</button>
      <button ogToggleGroupItem value="b" data-role="b">B</button>
    </div>

    <h2>Toolbar focus repair</h2>
    <div ogToolbar aria-label="Repair" data-toolbar-case="repair">
      @for (key of repairKeys(); track key) {
        <!-- Consumer-owned keys: Delete removes and D disables the focused control. -->
        <button
          ogToolbarItem
          [disabled]="repairDisabled().includes(key)"
          [attr.data-role]="key"
          (keydown.delete)="removeRepair(key)"
          (keydown.d)="toggleRepairDisabled(key)"
        >
          {{ key }}
        </button>
      }
      <div ogToggleGroupMultiple aria-label="Repair marks" data-role="repair-marks">
        @for (key of repairMarks(); track key) {
          <button
            ogToggleGroupItem
            [value]="key"
            [disabled]="repairDisabled().includes(key)"
            [attr.data-role]="key"
            (keydown.delete)="removeRepairMark(key)"
            (keydown.d)="toggleRepairDisabled(key)"
          >
            {{ key }}
          </button>
        }
      </div>
      <button
        ogToolbarItem
        [disabled]="selfDisabled()"
        data-role="self-disable"
        (focus)="selfDisabled.set(true); changeDetector.detectChanges()"
      >
        Disabled on focus
      </button>
    </div>
    <button type="button" data-testid="toolbar-repair-outside">Outside the repair toolbar</button>
    <button type="button" data-testid="toolbar-repair-remove-beta" (click)="removeRepair('beta')">
      Remove beta
    </button>
    <button type="button" data-testid="toolbar-repair-restore" (click)="restoreRepair()">
      Restore the repair toolbar
    </button>

    <h2>Toolbar with a group in Popover Content</h2>
    <div ogToolbar aria-label="Insert menu" data-toolbar-case="popover">
      <button ogToolbarItem data-role="before">Before</button>
      <span ogPopover [(open)]="insertOpen">
        <button ogPopoverTrigger ogPopoverAnchor ogToolbarItem data-role="trigger">Insert</button>
        <div ogPopoverContent role="group" aria-label="Insert options" data-role="content">
          <div ogToggleGroupSingle [(value)]="insertKind" aria-label="Kind" data-role="kinds">
            <button ogToggleGroupItem value="image" data-role="image">Image</button>
            <button ogToggleGroupItem value="table" data-role="table">Table</button>
          </div>
        </div>
      </span>
      <button ogToolbarItem data-role="after">After</button>
    </div>
  `,
})
export class ToolbarCases {
  readonly joinedKeys = signal(["cut", "copy", "marks"]);
  readonly marks = signal<readonly string[]>(["b"]);
  readonly marksDisabled = signal(false);
  readonly markOutputs = signal(0);
  readonly outside = signal<string | null>("b");
  readonly repairKeys = signal(["alpha", "beta", "gamma"]);
  readonly repairMarks = signal(["x", "y"]);
  readonly repairDisabled = signal<readonly string[]>([]);
  readonly selfDisabled = signal(false);
  readonly insertOpen = signal(false);
  readonly insertKind = signal<string | null>(null);
  readonly increment = (value: number): number => value + 1;
  readonly changeDetector = inject(ChangeDetectorRef);

  /** The joined group values in Collection order; Toolbar items have generated values. */
  knownValues(values: readonly string[]): string {
    const known: string[] = [];

    for (const value of values) {
      if (["b", "i", "u", "left", "right"].includes(value)) {
        known.push(value);
      } else {
        known.push("*");
      }
    }

    return known.join(",");
  }

  removeRepair(key: string): void {
    this.repairKeys.update((keys) => keys.filter((candidate) => candidate !== key));
  }

  removeRepairMark(key: string): void {
    this.repairMarks.update((keys) => keys.filter((candidate) => candidate !== key));
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
    this.repairKeys.set(["alpha", "beta", "gamma"]);
    this.repairMarks.set(["x", "y"]);
    this.repairDisabled.set([]);
    this.selfDisabled.set(false);
  }
}

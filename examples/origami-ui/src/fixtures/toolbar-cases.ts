import { ChangeDetectorRef, Component, Directive, inject, signal } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupItem,
  OrigamiToggleGroupState,
} from "@loozo/origami-ui/toggle-group";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarPopoverTrigger,
  OrigamiToolbarToggleGroupSingle,
  OrigamiToolbarToggleGroupMultiple,
} from "@loozo/origami-ui/toolbar";

// K2 keyboard, vertical and reading direction, the K3 Toolbar groups, the K4 focus repair, the K7
// standalone group in Popover Content, the K10 disabled Toolbar Popover Trigger and the K12–K14
// tab stop while focus is in a Toolbar Popover Trigger's own Content, beside the core seed's
// Toolbar. Each case is identified by `data-toolbar-case`.

/** A Toolbar group's effective orientation, read from its State. */
@Directive({ selector: "[toolbarGroupProbe]", exportAs: "toolbarGroupProbe" })
export class ToolbarGroupProbe {
  readonly state = inject(OrigamiToggleGroupState);
}

/** A Toolbar Single group rendered through a child component's own template inside a Toolbar. */
@Component({
  selector: "acceptance-toolbar-alignment",
  imports: [OrigamiToolbarToggleGroupSingle, OrigamiToggleGroupItem],
  template: `
    <div
      ogToolbarToggleGroupSingle
      [(value)]="alignment"
      aria-label="Alignment"
      data-role="alignment"
    >
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
    OrigamiToolbarToggleGroupMultiple,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupItem,
    OrigamiPopover,
    OrigamiToolbarPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
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

    <h2>Toolbar with Toolbar groups</h2>
    <div ogToolbar aria-label="Clipboard and format" data-toolbar-case="joined">
      @for (key of joinedKeys(); track key) {
        @if (key === "marks") {
          <div
            ogToolbarToggleGroupMultiple
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
      <div ogToolbarToggleGroupMultiple aria-label="Repair marks" data-role="repair-marks">
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
        <button ogToolbarPopoverTrigger ogPopoverAnchor data-role="trigger">Insert</button>
        <div ogPopoverContent role="group" aria-label="Insert options" data-role="content">
          <div ogToggleGroupSingle [(value)]="insertKind" aria-label="Kind" data-role="kinds">
            <button ogToggleGroupItem value="image" data-role="image">Image</button>
            <button ogToggleGroupItem value="table" data-role="table">Table</button>
          </div>
        </div>
      </span>
      <button ogToolbarItem data-role="after">After</button>
    </div>

    <h2>Toolbar with a disabled Popover Trigger</h2>
    <!-- The Trigger's own disabled, or its Popover's, is its disabled state in the Toolbar. -->
    <button type="button" data-testid="toolbar-format-before">Before the format toolbar</button>
    <div ogToolbar aria-label="Format" data-toolbar-case="disabled-popover">
      <span ogPopover [(open)]="formatOpen" [disabled]="formatRootDisabled()">
        <button
          ogToolbarPopoverTrigger
          ogPopoverAnchor
          [disabled]="formatDisabled()"
          data-role="trigger"
        >
          Format
        </button>
        <div ogPopoverContent role="group" aria-label="Format options" data-role="content">
          Format options
        </div>
      </span>
      <button ogToolbarItem data-role="bold">Bold</button>
    </div>
    <button type="button" data-testid="toolbar-format-disable" (click)="formatDisabled.set(!formatDisabled())">
      Toggle format disabled
    </button>
    <button
      type="button"
      data-testid="toolbar-format-root-disable"
      (click)="formatRootDisabled.set(!formatRootDisabled())"
    >
      Toggle the format Popover disabled
    </button>
    <output data-testid="toolbar-format-open">{{ formatOpen() }}</output>

    <h2>Toolbar with focus in a Popover Trigger's own Content</h2>
    <p data-testid="toolbar-paste-blank">Not focusable</p>
    <button type="button" data-testid="toolbar-paste-before">Before the paste toolbar</button>
    <div ogToolbar aria-label="Paste" data-toolbar-case="paste">
      <button ogToolbarItem data-role="copy">Copy</button>
      <span ogPopover [(open)]="pasteOpen">
        <button ogToolbarPopoverTrigger ogPopoverAnchor data-role="trigger">Paste special</button>
        @if (pasteMounted()) {
          <div ogPopoverContent role="group" aria-label="Paste options" data-role="content">
            <input aria-label="First" data-role="first" />
            <!-- Consumer-owned actions on focused controls: remove this button, close the
                 Popover, unmount its Content. -->
            @if (pasteRemovable()) {
              <button type="button" data-role="remove" (click)="pasteRemovable.set(false)">
                Remove this button
              </button>
            }
            <button type="button" data-role="close" (click)="pasteOpen.set(false)">Close</button>
            <button type="button" data-role="unmount" (click)="pasteMounted.set(false)">
              Unmount
            </button>
            <input aria-label="Last" data-role="last" />
          </div>
        }
      </span>
      <button ogToolbarItem data-role="paste">Paste</button>
    </div>
    <button type="button" data-testid="toolbar-paste-after">After the paste toolbar</button>
    <button type="button" data-testid="toolbar-paste-restore" (click)="restorePaste()">
      Restore the paste toolbar
    </button>

    <h2>Toolbars with their Trigger's Content authored outside them</h2>
    <button type="button" data-testid="toolbar-outside-before">Before the outside toolbars</button>
    <div ogPopover data-toolbar-case="content-after">
      <div ogToolbar aria-label="Content after" data-role="toolbar">
        <button ogToolbarItem data-role="copy">Copy</button>
        <button ogToolbarPopoverTrigger ogPopoverAnchor data-role="trigger">Options</button>
        <button ogToolbarItem data-role="paste">Paste</button>
      </div>
      <div ogPopoverContent role="group" aria-label="Options after" data-role="content">
        <input aria-label="First" data-role="first" />
        <input aria-label="Last" data-role="last" />
      </div>
    </div>
    <button type="button" data-testid="toolbar-outside-between">Between the outside toolbars</button>
    <div ogPopover data-toolbar-case="content-before">
      <div ogPopoverContent role="group" aria-label="Options before" data-role="content">
        <input aria-label="First" data-role="first" />
        <input aria-label="Last" data-role="last" />
      </div>
      <div ogToolbar aria-label="Content before" data-role="toolbar">
        <button ogToolbarItem data-role="copy">Copy</button>
        <button ogToolbarPopoverTrigger ogPopoverAnchor data-role="trigger">Options</button>
        <button ogToolbarItem data-role="paste">Paste</button>
      </div>
    </div>
    <button type="button" data-testid="toolbar-outside-after">After the outside toolbars</button>
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
  readonly formatOpen = signal(false);
  readonly formatDisabled = signal(true);
  readonly formatRootDisabled = signal(false);
  readonly pasteOpen = signal(false);
  readonly pasteMounted = signal(true);
  readonly pasteRemovable = signal(true);
  readonly increment = (value: number): number => value + 1;
  readonly changeDetector = inject(ChangeDetectorRef);

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

  restorePaste(): void {
    this.pasteOpen.set(false);
    this.pasteMounted.set(true);
    this.pasteRemovable.set(true);
  }

  restoreRepair(): void {
    this.repairKeys.set(["alpha", "beta", "gamma"]);
    this.repairMarks.set(["x", "y"]);
    this.repairDisabled.set([]);
    this.selfDisabled.set(false);
  }
}

import {
  ChangeDetectorRef,
  Component,
  Directive,
  ElementRef,
  Service,
  TemplateRef,
  ViewContainerRef,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipContentOptions,
  OrigamiTooltipTrigger,
  type OrigamiTooltipAlign,
  type OrigamiTooltipSide,
} from "@loozo/origami-ui/tooltip";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";
import { OrigamiButton } from "@loozo/origami-ui/button";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarPopoverTrigger,
  OrigamiToolbarToggle,
} from "@loozo/origami-ui/toolbar";
import {
  HintContent,
  HintRoot,
  ShadowTooltip,
  TooltipStateProbe,
  TooltipText,
} from "./tooltip-parts.js";

// Tooltip cases N1–N13. Each case is identified by `data-tooltip-case`; controls the tests use
// as script actions are buttons, so a script click is never a trusted pointer gesture.

type JournalEntry = { readonly kind: string; readonly at: number; readonly event: string };

/** N10: complete factory Content Options with ordinary writable signals. */
@Service({ autoProvided: false })
export class PlacementSettings {
  readonly id = signal("factory-placement-content");
  readonly side = signal<OrigamiTooltipSide>("inline-end");
  readonly align = signal<OrigamiTooltipAlign>("start");
  readonly gap = signal(10);
}

@Directive({
  selector: "[factoryPlacement]",
  hostDirectives: [{ directive: OrigamiTooltipContent, inputs: ["side", "align", "gap"] }],
  providers: [OrigamiTooltipContentOptions.provideFactory(() => inject(PlacementSettings))],
})
export class FactoryPlacement {}

@Component({
  selector: "acceptance-tooltip-fixture",
  imports: [
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiButton,
    OrigamiToggle,
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToolbarToggle,
    OrigamiToolbarPopoverTrigger,
    TooltipText,
    ShadowTooltip,
    HintRoot,
    HintContent,
    TooltipStateProbe,
    FactoryPlacement,
  ],
  providers: [PlacementSettings],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach tooltip behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section data-tooltip-case="describe">
      <h2>N1 description</h2>
      <span ogTooltip [openDelay]="0" [(open)]="describeOpen">
        <button
          type="button"
          ogTooltipTrigger
          class="trigger"
          aria-label="Theme"
          aria-describedby="static-note"
          data-testid="describe-trigger"
        >
          T
        </button>
        @if (describeMounted()) {
          <acceptance-tooltip-text [contentId]="describeId()" />
        }
      </span>
      <span id="static-note">Static note the Trigger no longer names</span>
      <span ogTooltip [openDelay]="0">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="role-trigger">
          Role
        </button>
        <span ogTooltipContent class="tooltip" role="status" data-testid="role-content"
          >Consumer role</span
        >
      </span>
      <button
        type="button"
        data-testid="describe-rename"
        (click)="describeId.set('describe-content-b')"
      >
        Rename Content
      </button>
      <button
        type="button"
        data-testid="describe-mount"
        (click)="describeMounted.set(!describeMounted())"
      >
        Mount or unmount Content
      </button>
      <button
        type="button"
        data-testid="describe-toggle"
        (click)="describeOpen.set(!describeOpen())"
      >
        Open or close
      </button>
      <output data-testid="describe-open">{{ describeOpen() }}</output>
    </section>

    <section data-tooltip-case="hover">
      <h2>N2 hover</h2>
      <span
        ogTooltip
        [openDelay]="hoverDelay()"
        [disabled]="hoverDisabled()"
        [(open)]="hoverOpen"
        (openChange)="record('change:' + $event)"
      >
        <button
          type="button"
          ogTooltipTrigger
          class="trigger"
          data-testid="hover-trigger"
          (pointerenter)="record('enter')"
        >
          Hover
        </button>
        <span ogTooltipContent class="tooltip" data-testid="hover-content">Hover hint</span>
      </span>
      <button type="button" data-testid="hover-delay-slow" (click)="hoverDelay.set(1000)">
        Delay 1000
      </button>
      <button type="button" data-testid="hover-delay-zero" (click)="hoverDelay.set(0)">
        Delay 0
      </button>
      <button type="button" data-testid="hover-delay-invalid" (click)="hoverDelay.set(-1)">
        Delay -1
      </button>
      <button type="button" data-testid="hover-delay-nan" (click)="hoverDelay.set(nan)">
        Delay NaN
      </button>
      <button
        type="button"
        data-testid="hover-disable"
        (click)="hoverDisabled.set(!hoverDisabled())"
      >
        Disable or enable
      </button>
      <button type="button" data-testid="hover-open" (click)="hoverOpen.set(true)">Open</button>
      <output data-testid="hover-intent">{{ hoverOpen() }}</output>
      <output data-testid="hover-journal">{{ journalText() }}</output>
    </section>

    <section data-tooltip-case="grace" class="stage">
      <h2>N3 grace area</h2>
      <span
        ogTooltip
        [openDelay]="0"
        [(open)]="graceOpen"
        (openChange)="graceChanges.update(increment)"
      >
        <button
          type="button"
          ogTooltipTrigger
          class="trigger wide"
          [style.writing-mode]="graceMode()"
          [attr.dir]="graceDirection()"
          data-testid="grace-trigger"
        >
          Grace
        </button>
        <span
          ogTooltipContent
          class="tooltip roomy"
          [side]="graceSide()"
          [gap]="12"
          data-testid="grace-content"
          >Grace hint</span
        >
      </span>
      <output data-testid="grace-intent">{{ graceOpen() }}</output>
      <output data-testid="grace-changes">{{ graceChanges() }}</output>
      <select data-testid="grace-side" aria-label="Grace side" (change)="choose($event, graceSide)">
        <option value="block-start">block-start</option>
        <option value="block-end">block-end</option>
        <option value="inline-start">inline-start</option>
        <option value="inline-end">inline-end</option>
      </select>
      <select
        data-testid="grace-mode"
        aria-label="Grace writing mode"
        (change)="choose($event, graceMode)"
      >
        <option value="horizontal-tb">horizontal-tb</option>
        <option value="vertical-rl">vertical-rl</option>
        <option value="sideways-lr">sideways-lr (unsupported)</option>
      </select>
      <select
        data-testid="grace-direction"
        aria-label="Grace direction"
        (change)="choose($event, graceDirection)"
      >
        <option value="ltr">ltr</option>
        <option value="rtl">rtl</option>
      </select>
    </section>

    <section data-tooltip-case="edge" class="edge">
      <span ogTooltip [openDelay]="0" [(open)]="edgeOpen">
        <button type="button" ogTooltipTrigger class="trigger wide" data-testid="edge-trigger">
          Edge
        </button>
        <span ogTooltipContent class="tooltip roomy" [gap]="12" data-testid="edge-content"
          >Flipped hint</span
        >
      </span>
      <output data-testid="edge-intent">{{ edgeOpen() }}</output>
    </section>

    <section data-tooltip-case="removal" class="stage">
      <h2>N3 N12 removal</h2>
      @if (removalRoot()) {
        <span ogTooltip [openDelay]="removalDelay()" [(open)]="removalOpen">
          @if (removalTrigger()) {
            <button
              type="button"
              ogTooltipTrigger
              class="trigger wide"
              data-testid="removal-trigger"
            >
              Removal
            </button>
          }
          @if (removalContent()) {
            <span ogTooltipContent class="tooltip roomy" [gap]="12" data-testid="removal-content">
              Removal hint
            </span>
          }
        </span>
      }
      <button type="button" data-testid="removal-root" (click)="removalRoot.set(!removalRoot())">
        Mount or unmount the root
      </button>
      <button
        type="button"
        data-testid="removal-trigger-mount"
        (click)="removalTrigger.set(!removalTrigger())"
      >
        Mount or unmount the Trigger
      </button>
      <button
        type="button"
        data-testid="removal-content-mount"
        (click)="removalContent.set(!removalContent())"
      >
        Mount or unmount Content
      </button>
      <button type="button" data-testid="removal-slow" (click)="removalDelay.set(1000)">
        Delay 1000
      </button>
      <output data-testid="removal-intent">{{ removalOpen() }}</output>
    </section>

    <section data-tooltip-case="focus">
      <h2>N4 focus</h2>
      <button type="button" data-testid="focus-before">Before</button>
      <span
        ogTooltip
        [openDelay]="300"
        [(open)]="focusOpen"
        (openChange)="focusChanges.update(increment)"
      >
        <button type="button" ogTooltipTrigger class="trigger" data-testid="focus-trigger">
          Focus
        </button>
        <span ogTooltipContent class="tooltip" data-testid="focus-content">Focus hint</span>
      </span>
      <span
        ogTooltip
        [openDelay]="300"
        [(open)]="inputTipOpen"
        (openChange)="focusChanges.update(increment)"
      >
        <input ogTooltipTrigger aria-label="Search" data-testid="focus-input" />
        <span ogTooltipContent class="tooltip" data-testid="focus-input-content">Search hint</span>
      </span>
      <button type="button" data-testid="focus-after">After</button>
      <output data-testid="focus-open">{{ focusOpen() }}</output>
      <output data-testid="input-tip-open">{{ inputTipOpen() }}</output>
      <output data-testid="focus-changes">{{ focusChanges() }}</output>
      <div ogPopover [(open)]="restoreOpen">
        <span ogTooltip [openDelay]="300" [(open)]="restoreTipOpen">
          <button
            ogPopoverTrigger
            ogPopoverAnchor
            ogTooltipTrigger
            class="trigger"
            data-testid="restore-trigger"
          >
            Menu
          </button>
          <span ogTooltipContent class="tooltip" data-testid="restore-tip-content">Menu hint</span>
        </span>
        <div ogPopoverContent class="surface" [gap]="4" data-testid="restore-content">
          <button type="button" data-testid="restore-item">Item</button>
        </div>
      </div>
      <output data-testid="restore-open">{{ restoreOpen() }}</output>
      <output data-testid="restore-tip-open">{{ restoreTipOpen() }}</output>
      <!-- Client-only: the shadow root isn't server-rendered. -->
      @if (attached()) {
        <acceptance-shadow-tooltip [(open)]="shadowOpen" />
      }
      <output data-testid="shadow-open">{{ shadowOpen() }}</output>
    </section>

    <section data-tooltip-case="label">
      <h2>N4 label</h2>
      <label for="label-for-input" data-testid="label-for">Email</label>
      <span ogTooltip [openDelay]="300" (openChange)="labelChange('for', $event)">
        <input id="label-for-input" ogTooltipTrigger data-testid="label-for-input" />
        <span ogTooltipContent class="tooltip" data-testid="label-for-content">Email hint</span>
      </span>
      <span ogTooltip [openDelay]="300" (openChange)="labelChange('wrap', $event)">
        <label data-testid="label-wrap"
          >Name <input ogTooltipTrigger data-testid="label-wrap-input"
        /></label>
        <span ogTooltipContent class="tooltip" data-testid="label-wrap-content">Name hint</span>
      </span>
      <output data-testid="label-journal">{{ labelJournal() }}</output>
    </section>

    <section data-tooltip-case="activation">
      <h2>N5 activation and Escape</h2>
      <input
        aria-label="Notes"
        data-testid="activation-field"
        (keydown)="maybePreventEscape($event)"
      />
      <span
        ogTooltip
        [openDelay]="0"
        [(open)]="activationOpen"
        (openChange)="activationChanges.update(increment)"
      >
        <button type="button" ogTooltipTrigger class="trigger" data-testid="activation-trigger">
          Act
        </button>
        <span ogTooltipContent class="tooltip" data-testid="activation-content">Act hint</span>
      </span>
      <span
        ogTooltip
        [openDelay]="0"
        [(open)]="appOpen"
        (openChange)="appChanges.update(increment)"
      >
        <button type="button" ogTooltipTrigger class="trigger" data-testid="app-trigger">
          App
        </button>
        <span ogTooltipContent class="tooltip" data-testid="app-content">App hint</span>
      </span>
      <button type="button" data-testid="app-open" (click)="appOpen.set(true)">
        Open by the application
      </button>
      <button
        type="button"
        data-testid="activation-prevent-escape"
        (click)="preventEscape.set(!preventEscape())"
      >
        Prevent Escape in the field
      </button>
      <output data-testid="activation-open">{{ activationOpen() }}</output>
      <output data-testid="activation-changes">{{ activationChanges() }}</output>
      <output data-testid="app-intent">{{ appOpen() }}</output>
      <output data-testid="app-changes">{{ appChanges() }}</output>
    </section>

    <section data-tooltip-case="disabled">
      <h2>N6 disabled and co-applied</h2>
      <span ogTooltip [openDelay]="0" disabled [(open)]="rootDisabledOpen">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="root-disabled-trigger">
          Root disabled
        </button>
        <span ogTooltipContent class="tooltip" data-testid="root-disabled-content"
          >Root disabled hint</span
        >
      </span>
      <button type="button" data-testid="root-disabled-open" (click)="rootDisabledOpen.set(true)">
        Open the disabled root
      </button>
      <output data-testid="root-disabled-intent">{{ rootDisabledOpen() }}</output>
      <span ogTooltip [openDelay]="0" [(open)]="nativeDisabledOpen">
        <button
          type="button"
          ogTooltipTrigger
          class="trigger"
          disabled
          data-testid="native-disabled-trigger"
        >
          Unavailable
        </button>
        <span ogTooltipContent class="tooltip" data-testid="native-disabled-content"
          >Never shown</span
        >
      </span>
      <output data-testid="native-disabled-intent">{{ nativeDisabledOpen() }}</output>
      <span ogTooltip [openDelay]="0" [(open)]="focusableOpen">
        <button
          ogButton
          ogTooltipTrigger
          class="trigger"
          [disabled]="true"
          focusableWhenDisabled
          data-testid="focusable-disabled-trigger"
        >
          Save
        </button>
        <span ogTooltipContent class="tooltip" data-testid="focusable-disabled-content"
          >Nothing to save yet</span
        >
      </span>
      <output data-testid="focusable-disabled-intent">{{ focusableOpen() }}</output>

      <span ogTooltip [openDelay]="0" [(open)]="coToggleTipOpen">
        <button
          ogToggle
          ogTooltipTrigger
          class="trigger"
          [disabled]="coDisabled()"
          [(pressed)]="coPressed"
          data-testid="co-toggle"
        >
          Bold
        </button>
        <span ogTooltipContent class="tooltip" data-testid="co-toggle-content">Bold text</span>
      </span>
      <div ogPopover [(open)]="coPopoverOpen">
        <span ogTooltip [openDelay]="0" [(open)]="coPopoverTipOpen">
          <button
            ogPopoverTrigger
            ogPopoverAnchor
            ogTooltipTrigger
            class="trigger"
            [disabled]="coDisabled()"
            data-testid="co-popover-trigger"
          >
            Menu
          </button>
          <span ogTooltipContent class="tooltip" data-testid="co-popover-tip">Open the menu</span>
        </span>
        <div ogPopoverContent class="surface" data-testid="co-popover-content">Menu items</div>
      </div>
      <div ogToolbar aria-label="Co-applied controls" data-testid="co-toolbar">
        <span ogTooltip [openDelay]="0" [(open)]="coToolbarToggleTipOpen">
          <button
            ogToolbarToggle
            ogTooltipTrigger
            class="trigger"
            [disabled]="coDisabled()"
            [(pressed)]="coToolbarPressed"
            data-testid="co-toolbar-toggle"
          >
            Italic
          </button>
          <span ogTooltipContent class="tooltip" data-testid="co-toolbar-toggle-tip"
            >Italic text</span
          >
        </span>
        <span ogPopover [(open)]="coToolbarPopoverOpen">
          <span ogTooltip [openDelay]="0" [(open)]="coToolbarPopoverTipOpen">
            <button
              ogToolbarPopoverTrigger
              ogPopoverAnchor
              ogTooltipTrigger
              class="trigger"
              [disabled]="coDisabled()"
              data-testid="co-toolbar-popover"
            >
              More
            </button>
            <span ogTooltipContent class="tooltip" data-testid="co-toolbar-popover-tip"
              >More actions</span
            >
          </span>
          <span ogPopoverContent class="surface" data-testid="co-toolbar-popover-content"
            >More items</span
          >
        </span>
      </div>
      <button type="button" data-testid="co-disable" (click)="coDisabled.set(!coDisabled())">
        Disable or enable the co-applied controls
      </button>
      <output data-testid="co-pressed">{{ coPressed() }}</output>
      <output data-testid="co-toggle-tip-open">{{ coToggleTipOpen() }}</output>
      <output data-testid="co-popover-open">{{ coPopoverOpen() }}</output>
      <output data-testid="co-popover-tip-open">{{ coPopoverTipOpen() }}</output>
      <output data-testid="co-toolbar-pressed">{{ coToolbarPressed() }}</output>
      <output data-testid="co-toolbar-toggle-tip-open">{{ coToolbarToggleTipOpen() }}</output>
      <output data-testid="co-toolbar-popover-open">{{ coToolbarPopoverOpen() }}</output>
      <output data-testid="co-toolbar-popover-tip-open">{{ coToolbarPopoverTipOpen() }}</output>

      <button type="button" data-testid="toolbar-before">Before the toolbar</button>
      <div ogToolbar aria-label="Tooltip toolbar" data-testid="tip-toolbar">
        @for (name of toolbarNames; track name) {
          <span ogTooltip [openDelay]="300">
            <button
              ogToolbarItem
              ogTooltipTrigger
              class="trigger"
              [attr.data-testid]="'tip-toolbar-' + name"
            >
              {{ name }}
            </button>
            <span
              ogTooltipContent
              class="tooltip"
              [attr.data-testid]="'tip-toolbar-' + name + '-content'"
              >{{ name }} hint</span
            >
          </span>
        }
      </div>
    </section>

    <section data-tooltip-case="escape">
      <h2>N7 Escape order</h2>
      <div ogPopover [(open)]="escapePopoverOpen">
        <button
          ogPopoverTrigger
          ogPopoverAnchor
          class="trigger"
          data-testid="escape-popover-trigger"
        >
          Popover with a Tooltip inside
        </button>
        <div ogPopoverContent class="surface" [gap]="4" data-testid="escape-popover-content">
          <span ogTooltip [openDelay]="0" [(open)]="innerTipOpen">
            <button type="button" ogTooltipTrigger class="trigger" data-testid="inner-tip-trigger">
              Inner
            </button>
            <span ogTooltipContent class="tooltip" data-testid="inner-tip-content">Inner hint</span>
          </span>
        </div>
      </div>
      <div ogPopover [(open)]="tipPopoverOpen">
        <span ogTooltip [openDelay]="0" [(open)]="triggerTipOpen">
          <button
            ogPopoverTrigger
            ogPopoverAnchor
            ogTooltipTrigger
            class="trigger"
            data-testid="tip-popover-trigger"
          >
            Popover with a Tooltip on its Trigger
          </button>
          <span ogTooltipContent class="tooltip" data-testid="trigger-tip-content"
            >Trigger hint</span
          >
        </span>
        <div ogPopoverContent class="surface" [gap]="4" data-testid="tip-popover-content">
          <button type="button" data-testid="tip-popover-item">Item</button>
        </div>
      </div>
      <button type="button" data-testid="escape-popover-open" (click)="escapePopoverOpen.set(true)">
        Open the first Popover
      </button>
      <button type="button" data-testid="tip-popover-open" (click)="tipPopoverOpen.set(true)">
        Open the second Popover
      </button>
      <output data-testid="escape-popover-intent">{{ escapePopoverOpen() }}</output>
      <output data-testid="inner-tip-intent">{{ innerTipOpen() }}</output>
      <output data-testid="tip-popover-intent">{{ tipPopoverOpen() }}</output>
      <output data-testid="trigger-tip-intent">{{ triggerTipOpen() }}</output>
    </section>

    <section data-tooltip-case="outside">
      <h2>N8 outside dismissal</h2>
      <button type="button" data-testid="outside-target">Outside</button>
      <div
        ogPopover
        [(open)]="outsidePopoverOpen"
        (openChange)="outsidePopoverChanges.update(increment)"
      >
        <button
          ogPopoverTrigger
          ogPopoverAnchor
          class="trigger"
          data-testid="outside-popover-trigger"
        >
          Popover
        </button>
        <div ogPopoverContent class="surface" [gap]="4" data-testid="outside-popover-content">
          <span ogTooltip [openDelay]="0" [(open)]="outsideTipOpen">
            <button
              type="button"
              ogTooltipTrigger
              class="trigger"
              data-testid="outside-tip-trigger"
            >
              Tip
            </button>
            <span ogTooltipContent class="tooltip" data-testid="outside-tip-content">Tip hint</span>
          </span>
          @if (pressMounted()) {
            <span ogTooltip [open]="true">
              <button type="button" ogTooltipTrigger class="trigger" data-testid="late-tip-trigger">
                Late
              </button>
              <span ogTooltipContent class="tooltip" data-testid="late-tip-content">Late hint</span>
            </span>
          }
        </div>
      </div>
      <span ogTooltip [openDelay]="0" [(open)]="dragTipOpen">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="drag-tip-trigger">
          Drag
        </button>
        <span
          ogTooltipContent
          class="tooltip roomy"
          side="block-end"
          [gap]="6"
          data-testid="drag-tip-content"
          >Drag from this hint</span
        >
      </span>
      <button
        type="button"
        data-testid="outside-popover-open"
        (click)="outsidePopoverOpen.set(true)"
      >
        Open the Popover
      </button>
      <button type="button" data-testid="press-mount" (click)="pressMounted.set(!pressMounted())">
        Mount or unmount a Tooltip in the Popover
      </button>
      <button type="button" data-testid="drag-tip-open" (click)="dragTipOpen.set(true)">
        Open the drag Tooltip
      </button>
      <output data-testid="outside-popover-intent">{{ outsidePopoverOpen() }}</output>
      <output data-testid="outside-popover-changes">{{ outsidePopoverChanges() }}</output>
      <output data-testid="outside-tip-intent">{{ outsideTipOpen() }}</output>
      <output data-testid="drag-tip-intent">{{ dragTipOpen() }}</output>
    </section>

    <section data-tooltip-case="nested">
      <h2>N9 inside Popover Content</h2>
      @if (nestedMounted()) {
        <div ogPopover [(open)]="nestedPopoverOpen">
          <button
            ogPopoverTrigger
            ogPopoverAnchor
            class="trigger"
            data-testid="nested-popover-trigger"
          >
            Nested Popover
          </button>
          <div ogPopoverContent class="surface" [gap]="4" data-testid="nested-popover-content">
            <span ogTooltip [openDelay]="0" [(open)]="nestedTipOpen">
              <button
                type="button"
                ogTooltipTrigger
                class="trigger"
                [attr.autofocus]="nestedAutofocus() ? '' : null"
                data-testid="nested-tip-trigger"
              >
                Inner
              </button>
              <span
                ogTooltipContent
                class="tooltip"
                side="block-end"
                [gap]="4"
                data-testid="nested-tip-content"
                (beforetoggle)="nestedShown($event)"
                >Inner hint</span
              >
            </span>
          </div>
        </div>
      }
      <button
        type="button"
        data-testid="nested-autofocus"
        (click)="nestedAutofocus.set(!nestedAutofocus())"
      >
        Autofocus the inner Trigger
      </button>
      <button
        type="button"
        data-testid="nested-open-both"
        (click)="nestedPopoverOpen.set(true); nestedTipOpen.set(true)"
      >
        Open both
      </button>
      <button
        type="button"
        data-testid="nested-close-popover"
        (click)="nestedPopoverOpen.set(false)"
      >
        Close the Popover
      </button>
      <button type="button" data-testid="nested-open-popover" (click)="nestedPopoverOpen.set(true)">
        Open the Popover
      </button>
      <button type="button" data-testid="nested-destroy" (click)="nestedMounted.set(false)">
        Destroy the Popover
      </button>
      <output data-testid="nested-popover-intent">{{ nestedPopoverOpen() }}</output>
      <output data-testid="nested-tip-intent">{{ nestedTipOpen() }}</output>
      <output data-testid="nested-journal">{{ nestedJournal() }}</output>
    </section>

    <section data-tooltip-case="placement" class="stage">
      <h2>N10 placement</h2>
      <span ogTooltip [openDelay]="0" [(open)]="placeOpen">
        <button
          type="button"
          ogTooltipTrigger
          class="trigger wide"
          [style.writing-mode]="placeMode()"
          [attr.dir]="placeDirection()"
          data-testid="place-trigger"
        >
          Placement
        </button>
        <span
          ogTooltipContent
          class="tooltip"
          [side]="placeSide()"
          [align]="placeAlign()"
          [gap]="placeGap()"
          data-testid="place-content"
          >Placed hint</span
        >
      </span>
      <select data-testid="place-side" aria-label="Side" (change)="choose($event, placeSide)">
        <option value="block-start">block-start</option>
        <option value="block-end">block-end</option>
        <option value="inline-start">inline-start</option>
        <option value="inline-end">inline-end</option>
      </select>
      <select
        data-testid="place-align"
        aria-label="Alignment"
        (change)="choose($event, placeAlign)"
      >
        <option value="center">center</option>
        <option value="start">start</option>
        <option value="end">end</option>
      </select>
      <select
        data-testid="place-mode"
        aria-label="Writing mode"
        (change)="choose($event, placeMode)"
      >
        <option value="horizontal-tb">horizontal-tb</option>
        <option value="vertical-rl">vertical-rl</option>
        <option value="vertical-lr">vertical-lr</option>
        <option value="sideways-lr">sideways-lr (unsupported)</option>
      </select>
      <select
        data-testid="place-direction"
        aria-label="Direction"
        (change)="choose($event, placeDirection)"
      >
        <option value="ltr">ltr</option>
        <option value="rtl">rtl</option>
      </select>
      <button type="button" data-testid="place-gap" (click)="placeGap.set(placeGap() + 8)">
        Gap + 8
      </button>
      <button type="button" data-testid="place-open" (click)="placeOpen.set(true)">Open</button>
      <button type="button" data-testid="place-close" (click)="placeOpen.set(false)">Close</button>
      <output data-testid="place-intent">{{ placeOpen() }}</output>

      <span ogTooltip [openDelay]="0" [(open)]="factoryOpen">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="factory-trigger">
          Factory
        </button>
        <span
          factoryPlacement
          class="tooltip"
          side="block-start"
          align="center"
          [gap]="40"
          data-testid="factory-content"
          >Factory hint</span
        >
      </span>
      <button type="button" data-testid="factory-open" (click)="factoryOpen.set(true)">
        Open the factory Tooltip
      </button>
      <button
        type="button"
        data-testid="factory-side"
        (click)="placement.side.set('block-end'); placement.gap.set(2)"
      >
        Factory side block-end, gap 2
      </button>
    </section>

    <section data-tooltip-case="lifecycle">
      <h2>N11 lifecycle</h2>
      <span ogTooltip [openDelay]="0" [(open)]="lifeOpen">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="life-trigger">
          Life
        </button>
        <span
          ogTooltipContent
          class="tooltip"
          [attr.data-motion]="lifeMotion()"
          data-testid="life-content"
          (beforetoggle)="lifeBeforeToggle($event)"
          (toggle)="lifeToggle($event)"
        >
          Life hint
        </span>
      </span>
      <select data-testid="life-motion" aria-label="Motion" (change)="choose($event, lifeMotion)">
        <option value="finite">finite</option>
        <option value="none">none</option>
        <option value="zero">zero</option>
        <option value="infinite">infinite</option>
      </select>
      <button type="button" data-testid="life-cancel" (click)="lifeCancel.set(!lifeCancel())">
        Cancel the next show
      </button>
      <button type="button" data-testid="life-open" (click)="lifeOpen.set(true)">Open</button>
      <button type="button" data-testid="life-close" (click)="lifeOpen.set(false)">Close</button>
      <button type="button" data-testid="life-close-on-show" (click)="lifeCloseOnShow.set(true)">
        Close during the next show, before reveal
      </button>
      <output data-testid="life-intent">{{ lifeOpen() }}</output>
      <output data-testid="life-shows">{{ lifeShows() }}</output>
      <output data-testid="life-toggles">{{ lifeToggles() }}</output>
    </section>

    <section data-tooltip-case="composition">
      <h2>N12 composition</h2>
      <acceptance-hint-root
        #hint
        [open]="false"
        [disabled]="true"
        [openDelay]="5000"
        (openChange)="hintOutputs.update(increment)"
      >
        <button type="button" ogTooltipTrigger class="trigger" data-testid="hint-trigger">
          Hint
        </button>
        <span
          hintContent
          class="tooltip"
          side="inline-end"
          align="end"
          [gap]="40"
          id="ignored-id"
          data-testid="hint-content"
          >Hint text</span
        >
        <i [tooltipStateProbe]="hint" data-testid="hint-probe"></i>
      </acceptance-hint-root>
      <button type="button" data-testid="hint-open" (click)="hint.settings.open.set(true)">
        Open the hint
      </button>
      <button type="button" data-testid="hint-close" (click)="hint.settings.open.set(false)">
        Close the hint
      </button>
      <output data-testid="hint-outputs">{{ hintOutputs() }}</output>
      <output data-testid="hint-state">{{ hint.state.open() }}</output>

      <span ogTooltip #outer="ogTooltip" [openDelay]="0" [(open)]="outerOpen">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="outer-trigger">
          Outer
        </button>
        <span
          ogTooltipContent
          #outerContent="ogTooltipContent"
          class="tooltip"
          data-testid="outer-content"
          >Outer hint</span
        >
        <i [tooltipStateProbe]="outer" data-testid="outer-probe"></i>
        <span ogTooltip #inner="ogTooltip" [openDelay]="0" [(open)]="innerOpen">
          <button type="button" ogTooltipTrigger class="trigger" data-testid="nested-inner-trigger">
            Inner
          </button>
          <span ogTooltipContent class="tooltip" data-testid="nested-inner-content"
            >Inner hint</span
          >
          <i [tooltipStateProbe]="inner" data-testid="inner-probe"></i>
        </span>
        <output data-testid="outer-state">{{ outer.state.open() }}</output>
        <output data-testid="outer-content-state">{{ outerContent.state.open() }}</output>
      </span>
      <button type="button" data-testid="outer-open" (click)="outerOpen.set(true)">
        Open the outer Tooltip
      </button>
      <output data-testid="inner-intent">{{ innerOpen() }}</output>
    </section>

    <section data-tooltip-case="group" class="stage">
      <h2>N13 delay group</h2>
      <div>
        @if (groupAMounted()) {
          <!-- Before A, so the three Triggers stay adjacent. -->
          <button type="button" data-testid="group-a-redecide" (click)="redecide(groupA)">
            Close and reopen A in one task
          </button>
          <!-- Hidden, so the Triggers don't move: a script click closes A's own root at once. -->
          <button
            type="button"
            hidden
            data-testid="group-a-close-now"
            (click)="groupA.open.set(false)"
          >
            Close A in this task
          </button>
          <span
            ogTooltip
            #groupA="ogTooltip"
            [openDelay]="200"
            [(open)]="groupAOpen"
            (openChange)="groupRecord('a:' + $event)"
          >
            <!-- A child view of A's root: destroying A removes its Trigger before the root. -->
            @if (true) {
              <button
                type="button"
                ogTooltipTrigger
                class="trigger wide"
                data-testid="group-a-trigger"
                (pointerenter)="groupRecord('a:enter')"
              >
                A
              </button>
            }
            <!-- Reaches over B, whose Trigger rises above A's, so a path to it can cross B. -->
            <span
              ogTooltipContent
              class="tooltip roomy"
              align="start"
              [gap]="12"
              data-testid="group-a-content"
              >Group hint A, wide enough to reach over B and C</span
            >
          </span>
        }
        <span ogTooltip [openDelay]="200" [(open)]="groupBOpen" (openChange)="groupBChange($event)">
          <button
            type="button"
            ogTooltipTrigger
            class="trigger wide tall"
            data-testid="group-b-trigger"
            (pointerenter)="groupRecord('b:enter')"
          >
            B
          </button>
          <span ogTooltipContent class="tooltip roomy" [gap]="12" data-testid="group-b-content"
            >Group hint B</span
          >
        </span>
        <span
          ogTooltip
          [openDelay]="200"
          [(open)]="groupCOpen"
          (openChange)="groupRecord('c:' + $event)"
        >
          <button
            type="button"
            ogTooltipTrigger
            class="trigger wide"
            data-testid="group-c-trigger"
            (pointerenter)="groupRecord('c:enter')"
          >
            C
          </button>
          <span ogTooltipContent class="tooltip roomy" [gap]="12" data-testid="group-c-content"
            >Group hint C</span
          >
        </span>
      </div>
      <button
        type="button"
        data-testid="group-a-mount"
        (click)="groupAMounted.set(!groupAMounted())"
      >
        Mount or unmount A
      </button>
      <button type="button" data-testid="group-a-close" (click)="groupAOpen.set(false)">
        Close A
      </button>
      <button type="button" data-testid="group-c-toggle" (click)="groupCOpen.set(!groupCOpen())">
        Open or close C
      </button>
      <button type="button" data-testid="group-b-destroys-a" (click)="groupBDestroysA.set(true)">
        Destroy A in B's open output
      </button>
      <output data-testid="group-a-intent">{{ groupAOpen() }}</output>
      <output data-testid="group-b-intent">{{ groupBOpen() }}</output>
      <output data-testid="group-c-intent">{{ groupCOpen() }}</output>
      <output data-testid="group-journal">{{ groupJournalText() }}</output>
    </section>

    <section data-tooltip-case="group-teardown" class="stage">
      <h2>N13 delay group: a close output that destroys the opening Tooltip</h2>
      <!-- First, so destroying Y, W's Trigger or S never moves Z. -->
      <span ogTooltip [openDelay]="200" (openChange)="teardownRecord('z:' + $event)">
        <button
          type="button"
          ogTooltipTrigger
          class="trigger"
          data-testid="teardown-z-trigger"
          (pointerenter)="teardownRecord('z:enter')"
        >
          Z
        </button>
        <span ogTooltipContent class="tooltip" data-testid="teardown-z-content"
          >Teardown hint Z</span
        >
      </span>
      <span ogTooltip [openDelay]="0" (openChange)="teardownChange($event)">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="teardown-x-trigger">
          X
        </button>
        <span ogTooltipContent class="tooltip" data-testid="teardown-x-content"
          >Teardown hint X</span
        >
      </span>
      <ng-template #teardownSlot />
      <ng-template #teardownY>
        <span ogTooltip (openChange)="teardownRecord('y:' + $event)">
          <button type="button" ogTooltipTrigger class="trigger" data-testid="teardown-y-trigger">
            Y
          </button>
          <span ogTooltipContent class="tooltip" data-testid="teardown-y-content"
            >Teardown hint Y</span
          >
        </span>
      </ng-template>
      <!-- X's close output removes only W's Trigger; W's root and Content stay. -->
      <span ogTooltip [(open)]="teardownWOpen" (openChange)="teardownRecord('w:' + $event)">
        <ng-template #teardownWSlot />
        <ng-template #teardownWTrigger>
          <button type="button" ogTooltipTrigger class="trigger" data-testid="teardown-w-trigger">
            W
          </button>
        </ng-template>
        <span ogTooltipContent class="tooltip" data-testid="teardown-w-content"
          >Teardown hint W</span
        >
      </span>
      <ng-template #teardownSSlot />
      <ng-template #teardownS>
        <span
          ogTooltip
          #teardownSRoot="ogTooltip"
          [openDelay]="0"
          (openChange)="teardownSelf($event)"
        >
          <button type="button" ogTooltipTrigger class="trigger" data-testid="teardown-s-trigger">
            S
          </button>
          <span ogTooltipContent class="tooltip" data-testid="teardown-s-content"
            >Teardown hint S</span
          >
        </span>
        <button
          type="button"
          data-testid="teardown-s-redecide"
          (click)="redecideTeardownS(teardownSRoot)"
        >
          Close and reopen S in one task
        </button>
      </ng-template>
      <button type="button" data-testid="teardown-y-mount" (click)="mountTeardownY()">
        Mount Y
      </button>
      <button type="button" data-testid="teardown-w-mount" (click)="mountTeardownW()">
        Mount W's Trigger
      </button>
      <button type="button" data-testid="teardown-s-mount" (click)="mountTeardownS()">
        Mount S
      </button>
      <button type="button" data-testid="teardown-s-unmount" (click)="unmountTeardownS()">
        Destroy S
      </button>
      <output data-testid="teardown-w-intent">{{ teardownWOpen() }}</output>
      <!-- After the Triggers, so its growth never moves them under the pointer. -->
      <output data-testid="teardown-journal">{{ teardownJournalText() }}</output>
    </section>

    <section data-tooltip-case="group-reentry" class="stage">
      <h2>N13 delay group: an output that focuses another Trigger</h2>
      <span ogTooltip [openDelay]="0" [(open)]="reentryPOpen" (openChange)="reentryChange($event)">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="reentry-p-trigger">
          P
        </button>
        <!-- Away from O, so moving onto O leaves P's grace area at once. -->
        <span ogTooltipContent class="tooltip" side="inline-start" data-testid="reentry-p-content"
          >P</span
        >
      </span>
      <span
        ogTooltip
        [openDelay]="0"
        [(open)]="reentryOOpen"
        (openChange)="groupRecord('o:' + $event)"
      >
        <button type="button" ogTooltipTrigger class="trigger" data-testid="reentry-o-trigger">
          O
        </button>
        <span ogTooltipContent class="tooltip" data-testid="reentry-o-content">O</span>
      </span>
      <span ogTooltip [(open)]="reentryQOpen" (openChange)="groupRecord('q:' + $event)">
        <input #reentryQ ogTooltipTrigger aria-label="Q" data-testid="reentry-q-trigger" />
        <span ogTooltipContent class="tooltip" data-testid="reentry-q-content">Q</span>
      </span>
      <button
        type="button"
        data-testid="reentry-focus-on-close"
        (click)="reentryFocusOnOpen.set(false)"
      >
        Focus Q on P's close instead
      </button>
      <output data-testid="reentry-p-intent">{{ reentryPOpen() }}</output>
      <output data-testid="reentry-o-intent">{{ reentryOOpen() }}</output>
      <output data-testid="reentry-q-intent">{{ reentryQOpen() }}</output>
    </section>

    <section data-tooltip-case="group-join" class="stage">
      <h2>N13 delay group: an open output that destroys or closes its own Tooltip</h2>
      <!-- Before K, so moving from K onto T crosses neither V nor U. -->
      <span ogTooltip [openDelay]="200" (openChange)="joinRecord('t:' + $event)">
        <button
          type="button"
          ogTooltipTrigger
          class="trigger"
          data-testid="join-t-trigger"
          (pointerenter)="joinRecord('t:enter')"
        >
          T
        </button>
        <span ogTooltipContent class="tooltip" data-testid="join-t-content">Join hint T</span>
      </span>
      <span ogTooltip [openDelay]="0" (openChange)="joinRecord('k:' + $event)">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="join-k-trigger">
          K
        </button>
        <span ogTooltipContent class="tooltip" data-testid="join-k-content">Join hint K</span>
      </span>
      <ng-template #joinSlot />
      <ng-template #joinV>
        <span ogTooltip (openChange)="joinDestroy($event)">
          <button type="button" ogTooltipTrigger class="trigger" data-testid="join-v-trigger">
            V
          </button>
          <span ogTooltipContent class="tooltip" data-testid="join-v-content">Join hint V</span>
        </span>
      </ng-template>
      <span ogTooltip #joinU="ogTooltip" (openChange)="joinVeto(joinU, $event)">
        <button type="button" ogTooltipTrigger class="trigger" data-testid="join-u-trigger">
          U
        </button>
        <span ogTooltipContent class="tooltip" data-testid="join-u-content">Join hint U</span>
      </span>
      <button type="button" data-testid="join-v-mount" (click)="mountJoinV()">Mount V</button>
      <!-- After the Triggers, so its growth never moves them under the pointer. -->
      <output data-testid="join-journal">{{ joinJournalText() }}</output>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    section {
      padding: 12px 0;
    }
    .stage {
      padding: 140px 220px;
    }
    .edge {
      padding: 0 220px;
    }
    .trigger {
      padding: 6px 10px;
      margin: 4px;
    }
    .wide {
      padding: 10px 24px;
    }
    .tall {
      padding-block: 20px;
    }
    .tooltip {
      box-sizing: border-box;
      padding: 4px 8px;
      border: 1px solid #555555;
      border-radius: 4px;
      background: #2b2b2b;
      color: #eeeeee;
      font:
        13px/1.2 system-ui,
        sans-serif;
      white-space: nowrap;
    }
    .roomy {
      padding: 10px 40px;
    }
    .surface {
      box-sizing: border-box;
      inline-size: 220px;
      padding: 12px;
      border: 1px solid #555555;
      background: #1e1e1e;
      color: #eeeeee;
    }
    .tooltip[data-motion="finite"][data-entering] {
      animation: tooltip-fade 300ms linear;
    }
    .tooltip[data-motion="finite"][data-leaving] {
      animation: tooltip-fade 300ms linear reverse;
    }
    .tooltip[data-motion="zero"][data-leaving] {
      animation: tooltip-fade 0ms linear reverse;
    }
    .tooltip[data-motion="infinite"][data-leaving] {
      animation: tooltip-fade 300ms linear infinite;
    }
    @keyframes tooltip-fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tooltip[data-motion] {
        animation: none !important;
      }
    }
  `,
})
export class TooltipFixture {
  readonly attached = signal(false);
  readonly placement = inject(PlacementSettings);
  readonly nan = Number.NaN;
  readonly increment = (value: number): number => value + 1;

  readonly describeOpen = signal(false);
  readonly describeId = signal("describe-content-a");
  readonly describeMounted = signal(true);

  readonly hoverDelay = signal(200);
  readonly hoverDisabled = signal(false);
  readonly hoverOpen = signal(false);
  readonly journal = signal<readonly JournalEntry[]>([]);

  readonly graceOpen = signal(false);
  readonly graceChanges = signal(0);
  readonly graceSide = signal<OrigamiTooltipSide>("block-start");
  readonly graceMode = signal("horizontal-tb");
  readonly graceDirection = signal("ltr");
  readonly edgeOpen = signal(false);

  readonly removalRoot = signal(true);
  readonly removalTrigger = signal(true);
  readonly removalContent = signal(true);
  readonly removalDelay = signal(0);
  readonly removalOpen = signal(false);

  readonly focusOpen = signal(false);
  readonly inputTipOpen = signal(false);
  readonly focusChanges = signal(0);
  readonly shadowOpen = signal(false);
  readonly restoreOpen = signal(false);
  readonly restoreTipOpen = signal(false);
  readonly labelJournal = signal("");

  readonly activationOpen = signal(false);
  readonly activationChanges = signal(0);
  readonly appOpen = signal(false);
  readonly appChanges = signal(0);
  readonly preventEscape = signal(false);

  readonly rootDisabledOpen = signal(false);
  readonly nativeDisabledOpen = signal(false);
  readonly focusableOpen = signal(false);
  readonly coDisabled = signal(true);
  readonly coPressed = signal(false);
  readonly coToggleTipOpen = signal(false);
  readonly coPopoverOpen = signal(false);
  readonly coPopoverTipOpen = signal(false);
  readonly coToolbarPressed = signal(false);
  readonly coToolbarToggleTipOpen = signal(false);
  readonly coToolbarPopoverOpen = signal(false);
  readonly coToolbarPopoverTipOpen = signal(false);
  readonly toolbarNames = ["cut", "copy", "paste"];

  readonly escapePopoverOpen = signal(false);
  readonly innerTipOpen = signal(false);
  readonly tipPopoverOpen = signal(false);
  readonly triggerTipOpen = signal(false);

  readonly outsidePopoverOpen = signal(false);
  readonly outsidePopoverChanges = signal(0);
  readonly outsideTipOpen = signal(false);
  readonly pressMounted = signal(false);
  readonly dragTipOpen = signal(false);

  readonly nestedMounted = signal(true);
  readonly nestedPopoverOpen = signal(false);
  readonly nestedTipOpen = signal(false);
  readonly nestedAutofocus = signal(false);
  readonly nestedJournal = signal("");

  readonly placeOpen = signal(false);
  readonly placeSide = signal<OrigamiTooltipSide>("block-start");
  readonly placeAlign = signal<OrigamiTooltipAlign>("center");
  readonly placeGap = signal(6);
  readonly placeMode = signal("horizontal-tb");
  readonly placeDirection = signal("ltr");
  readonly factoryOpen = signal(false);

  readonly lifeOpen = signal(false);
  readonly lifeMotion = signal("finite");
  readonly lifeCancel = signal(false);
  readonly lifeCloseOnShow = signal(false);
  readonly lifeShows = signal(0);
  readonly lifeToggles = signal(0);

  readonly hintOutputs = signal(0);
  readonly outerOpen = signal(false);
  readonly innerOpen = signal(false);

  readonly groupAMounted = signal(true);
  readonly groupAOpen = signal(false);
  readonly groupBOpen = signal(false);
  readonly groupCOpen = signal(false);
  readonly groupJournal = signal<readonly JournalEntry[]>([]);
  readonly groupBDestroysA = signal(false);
  readonly #changeDetector = inject(ChangeDetectorRef);

  readonly teardownSlot = viewChild.required("teardownSlot", { read: ViewContainerRef });
  readonly teardownY = viewChild.required<TemplateRef<unknown>>("teardownY");
  readonly teardownWOpen = signal(false);
  readonly teardownWSlot = viewChild.required("teardownWSlot", { read: ViewContainerRef });
  readonly teardownWTrigger = viewChild.required<TemplateRef<unknown>>("teardownWTrigger");
  readonly teardownSSlot = viewChild.required("teardownSSlot", { read: ViewContainerRef });
  readonly teardownS = viewChild.required<TemplateRef<unknown>>("teardownS");
  #teardownSRedeciding = false;
  readonly teardownJournal = signal<readonly JournalEntry[]>([]);

  readonly reentryPOpen = signal(false);
  readonly reentryOOpen = signal(false);
  readonly reentryQOpen = signal(false);
  readonly reentryFocusOnOpen = signal(true);
  readonly reentryQ = viewChild.required<ElementRef<HTMLInputElement>>("reentryQ");

  readonly joinSlot = viewChild.required("joinSlot", { read: ViewContainerRef });
  readonly joinV = viewChild.required<TemplateRef<unknown>>("joinV");
  readonly joinJournal = signal<readonly JournalEntry[]>([]);

  readonly journalText = (): string => JSON.stringify(this.journal());

  /**
   * Each hover entry and open change with its dispatching event, timed by that event, or by now for
   * a timer: a listener running after the Trigger's would otherwise shorten the measured delay.
   */
  record(kind: string): void {
    const entry: JournalEntry = {
      kind,
      at: window.event?.timeStamp ?? performance.now(),
      event: window.event?.type ?? "none",
    };

    this.journal.update((entries) => [...entries, entry]);
  }

  readonly groupJournalText = (): string => JSON.stringify(this.groupJournal());

  /** N13: like `record`, for the delay group's three Tooltips. */
  groupRecord(kind: string): void {
    const entry: JournalEntry = {
      kind,
      at: window.event?.timeStamp ?? performance.now(),
      event: window.event?.type ?? "none",
    };

    this.groupJournal.update((entries) => [...entries, entry]);
  }

  /** N13: B's open output destroys A's view synchronously, once enabled. */
  groupBChange(open: boolean): void {
    this.groupRecord(`b:${open}`);

    if (open && this.groupBDestroysA()) {
      this.groupAMounted.set(false);
      this.#changeDetector.detectChanges();
    }
  }

  readonly teardownJournalText = (): string => JSON.stringify(this.teardownJournal());

  /** N13: like `groupRecord`, for the Tooltips whose outputs destroy another one's parts. */
  teardownRecord(kind: string): void {
    const entry: JournalEntry = {
      kind,
      at: window.event?.timeStamp ?? performance.now(),
      event: window.event?.type ?? "none",
    };

    this.teardownJournal.update((entries) => [...entries, entry]);
  }

  mountTeardownY(): void {
    this.teardownSlot().clear();
    this.teardownSlot().createEmbeddedView(this.teardownY());
  }

  /** A replacement for the Trigger X's close removed. */
  mountTeardownW(): void {
    this.teardownWSlot().clear();
    this.teardownWSlot().createEmbeddedView(this.teardownWTrigger());
  }

  /** N13: X's close output destroys Y's view and W's Trigger synchronously. */
  teardownChange(open: boolean): void {
    this.teardownRecord(`x:${open}`);

    if (!open) {
      this.teardownSlot().clear();
      this.teardownWSlot().clear();
    }
  }

  mountTeardownS(): void {
    this.teardownSSlot().clear();
    this.teardownSSlot().createEmbeddedView(this.teardownS());
  }

  unmountTeardownS(): void {
    this.teardownSSlot().clear();
  }

  /** N13: S's close output destroys S's own view synchronously, except inside its redecision. */
  teardownSelf(open: boolean): void {
    this.teardownRecord(`s:${open}`);

    if (!open && !this.#teardownSRedeciding) {
      this.teardownSSlot().clear();
    }
  }

  redecideTeardownS(tooltip: OrigamiTooltip): void {
    this.#teardownSRedeciding = true;
    this.redecide(tooltip);
    this.#teardownSRedeciding = false;
  }

  /** N13: P's `openChange` focuses Q's `<input>` Trigger synchronously, on its open or its close. */
  reentryChange(open: boolean): void {
    this.groupRecord(`p:${open}`);

    if (open === this.reentryFocusOnOpen()) {
      this.reentryQ().nativeElement.focus();
    }
  }

  readonly joinJournalText = (): string => JSON.stringify(this.joinJournal());

  /** N13: like `groupRecord`, for the Tooltips whose open output destroys or closes them. */
  joinRecord(kind: string): void {
    const entry: JournalEntry = {
      kind,
      at: window.event?.timeStamp ?? performance.now(),
      event: window.event?.type ?? "none",
    };

    this.joinJournal.update((entries) => [...entries, entry]);
  }

  mountJoinV(): void {
    this.joinSlot().clear();
    this.joinSlot().createEmbeddedView(this.joinV());
  }

  /** N13: V's open output destroys V's root synchronously. */
  joinDestroy(open: boolean): void {
    this.joinRecord(`v:${open}`);

    if (open) {
      this.joinSlot().clear();
    }
  }

  /** N13: U's open output writes U closed again, through its model, in the same task. */
  joinVeto(tooltip: OrigamiTooltip, open: boolean): void {
    this.joinRecord(`u:${open}`);

    if (open) {
      tooltip.open.set(false);
    }
  }

  /** An application decision that replaces the effective intent before any close is observed. */
  redecide(tooltip: OrigamiTooltip): void {
    tooltip.open.set(false);
    tooltip.open.set(true);
  }

  choose(event: Event, target: { set(value: string): void }): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected a fixture select");
    }

    target.set(event.target.value);
  }

  maybePreventEscape(event: KeyboardEvent): void {
    if (this.preventEscape() && event.key === "Escape") {
      event.preventDefault();
    }
  }

  labelChange(name: string, open: boolean): void {
    this.labelJournal.update((text) => `${text}${name}:${open};`);
  }

  /** At the inner Tooltip's opening, records whether the Popover was already revealed. */
  nestedShown(event: Event): void {
    if (!(event instanceof ToggleEvent) || event.newState !== "open") {
      return;
    }

    const popover = document.querySelector('[data-testid="nested-popover-content"]');

    if (!(popover instanceof HTMLElement)) {
      throw new Error("Expected the nested Popover Content");
    }

    const revealed =
      popover.matches(":popover-open") &&
      getComputedStyle(popover).opacity === "1" &&
      popover.style.getPropertyValue("left") !== "";

    this.nestedJournal.update((text) => `${text}${revealed ? "revealed" : "unrevealed"};`);
  }

  lifeBeforeToggle(event: Event): void {
    if (!(event instanceof ToggleEvent) || event.newState !== "open") {
      return;
    }

    this.lifeShows.update(this.increment);

    if (this.lifeCancel()) {
      this.lifeCancel.set(false);
      event.preventDefault();
    }

    // Native callbacks may write the effective Options; this one closes before any reveal.
    if (this.lifeCloseOnShow()) {
      this.lifeCloseOnShow.set(false);
      this.lifeOpen.set(false);
    }
  }

  lifeToggle(event: Event): void {
    if (event instanceof ToggleEvent) {
      this.lifeToggles.update(this.increment);
    }
  }
}

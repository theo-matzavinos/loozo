import {
  Component,
  Directive,
  Service,
  ViewEncapsulation,
  inject,
  model,
  signal,
} from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogContentOptions,
  OrigamiDialogDescription,
  OrigamiDialogOptions,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

// Dialog cases Y1–Y15. Controls the tests use as script actions are buttons; a dialog's own
// controls sit inside it, since the rest of the page is inert while it's modal.

function increment(value: number): number {
  return value + 1;
}

/** Y6: a Title and a Description rendered by a child component inside Content. */
@Component({
  selector: "dialog-heading",
  imports: [OrigamiDialogTitle, OrigamiDialogDescription],
  template: `
    <h2 ogDialogTitle data-testid="child-title">Title from a child component</h2>
    <p ogDialogDescription data-testid="child-description">Description from a child component</p>
  `,
})
export class DialogHeading {}

/** Y12: a Tooltip and a Popover inside an open shadow root, rendered inside Dialog Content. */
@Component({
  selector: "dialog-shadow-layers",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
  ],
  template: `
    <div ogTooltip [(open)]="tooltipOpen">
      <button type="button" ogTooltipTrigger aria-label="Info" data-testid="shadow-tooltip-trigger">
        i
      </button>
      <span ogTooltipContent data-testid="shadow-tooltip-content">Tip</span>
    </div>
    <div ogPopover [(open)]="popoverOpen">
      <button ogPopoverTrigger ogPopoverAnchor data-testid="shadow-popover-trigger">Choose</button>
      <div
        ogPopoverContent
        data-testid="shadow-popover-content"
        role="group"
        aria-label="Shadow choices"
      >
        Choice
      </div>
    </div>
  `,
})
export class DialogShadowLayers {
  readonly tooltipOpen = model(false);
  readonly popoverOpen = model(false);
}

/**
 * Y12: a ShadowDom region with a named slot, and a Tooltip whose Content is another slot's
 * fallback content.
 */
@Component({
  selector: "dialog-optional-region",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  template: `
    <slot name="visible"></slot>
    <div ogTooltip [(open)]="tooltipOpen">
      <button type="button" ogTooltipTrigger aria-label="Fallback info">i</button>
      <slot name="extra">
        <span ogTooltipContent data-testid="fallback-tooltip-content">Fallback tip</span>
      </slot>
    </div>
  `,
})
export class DialogOptionalRegion {
  readonly tooltipOpen = model(false);
}

/** Y12, Y15: a ShadowDom root whose `<dialog>` slots its light-DOM children; with `motion`, it has an exit. */
@Component({
  selector: "slot-dialog",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [OrigamiDialogContent, OrigamiDialogTitle],
  hostDirectives: [{ directive: OrigamiDialog, inputs: ["open"], outputs: ["openChange"] }],
  template: `
    <dialog ogDialogContent data-testid="slotted-content">
      <h2 ogDialogTitle>Dialog with slotted layers</h2>
      <slot></slot>
    </dialog>
  `,
  styles: `
    :host(.motion) dialog[data-leaving] {
      animation: slot-dialog-leave 300ms linear forwards;
    }
    @keyframes slot-dialog-leave {
      to {
        opacity: 0.2;
      }
    }
  `,
})
export class SlotDialog {}

/** Y15: a root through `hostDirectives` that projects its children into its `<dialog>`, with an exit. */
@Component({
  selector: "projected-dialog",
  imports: [OrigamiDialogContent, OrigamiDialogTitle],
  hostDirectives: [{ directive: OrigamiDialog, inputs: ["open"], outputs: ["openChange"] }],
  template: `
    <dialog ogDialogContent data-testid="projected-content">
      <h2 ogDialogTitle>Dialog with projected layers</h2>
      <ng-content />
    </dialog>
  `,
  styles: `
    dialog[data-leaving] {
      animation: projected-dialog-leave 300ms linear forwards;
    }
    @keyframes projected-dialog-leave {
      to {
        opacity: 0.2;
      }
    }
  `,
})
export class ProjectedDialog {}

/** Y7: a ShadowDom root with its Trigger and Content in its shadow root; light-DOM children are slotted. */
@Component({
  selector: "shadow-focus-dialog",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [OrigamiDialogTrigger, OrigamiDialogContent, OrigamiDialogTitle, OrigamiDialogClose],
  hostDirectives: [{ directive: OrigamiDialog, inputs: ["open"], outputs: ["openChange"] }],
  template: `
    <button ogDialogTrigger data-testid="shadow-focus-trigger">Open shadow focus</button>
    <dialog ogDialogContent data-testid="shadow-focus-content">
      <h2 ogDialogTitle>Shadow focus dialog</h2>
      <button ogDialogClose data-testid="shadow-focus-close">Close</button>
      <slot></slot>
    </dialog>
  `,
})
export class ShadowFocusDialog {}

/** Y9: replacement root Options with ordinary writable signals. */
@Service({ autoProvided: false })
export class DialogSettings {
  readonly open = signal(false);
  readonly dismissible = signal(false);
}

/** Y9: a consumer root whose factory Options contradict its exposed own inputs. */
@Directive({
  selector: "[factoryDialog]",
  hostDirectives: [
    { directive: OrigamiDialog, inputs: ["open", "dismissible"], outputs: ["openChange"] },
  ],
  providers: [OrigamiDialogOptions.provideFactory(() => inject(DialogSettings))],
})
export class FactoryDialog {}

/** Y9: consumer Content whose factory Options supply the ID and focus return. */
@Directive({
  selector: "dialog[factoryContent]",
  hostDirectives: [{ directive: OrigamiDialogContent, inputs: ["id"] }],
  providers: [
    OrigamiDialogContentOptions.provideFactory(() => ({
      id: signal("factory-dialog-content"),
      returnFocus: signal(null),
    })),
  ],
})
export class FactoryContent {}

/** Y9: an application component that is the Dialog root through `hostDirectives`. */
@Component({
  selector: "filters-sheet",
  imports: [OrigamiDialogContent, OrigamiDialogTitle],
  hostDirectives: [{ directive: OrigamiDialog, inputs: ["open"], outputs: ["openChange"] }],
  template: `
    <dialog ogDialogContent data-testid="composed-content" #content="ogDialogContent">
      <h2 ogDialogTitle>Filters</h2>
      <button type="button" data-testid="composed-apply" (click)="apply()">Apply</button>
      <output data-testid="composed-state"
        >{{ dialog.state.open() }} {{ content.state.open() }}</output
      >
    </dialog>
  `,
})
export class FiltersSheet {
  readonly dialog = inject(OrigamiDialog);

  apply(): void {
    this.dialog.open.set(false);
  }
}

@Component({
  selector: "acceptance-dialog-fixture",
  imports: [
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogDescription,
    OrigamiDialogClose,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    DialogHeading,
    FactoryDialog,
    FactoryContent,
    FiltersSheet,
    DialogShadowLayers,
    DialogOptionalRegion,
    SlotDialog,
    ProjectedDialog,
    ShadowFocusDialog,
  ],
  providers: [DialogSettings],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach dialog behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="outside" #outsideButton>Outside</button>

    <section>
      <h2>Basic</h2>
      <div
        ogDialog
        #basic="ogDialog"
        [(open)]="basicOpen"
        [dismissible]="basicDismissible()"
        (openChange)="basicOutputs.update(increment)"
      >
        <button ogDialogTrigger data-testid="basic-trigger">Open basic</button>
        <dialog
          ogDialogContent
          #basicContent="ogDialogContent"
          #basicElement
          data-testid="basic-content"
          (cancel)="basicCancels.update(increment)"
        >
          <h2 ogDialogTitle data-testid="basic-title">Basic dialog</h2>
          <p ogDialogDescription data-testid="basic-description">A basic dialog.</p>
          <input data-testid="basic-input" aria-label="Basic input" />
          @if (basicContent.state.open()) {
            <span data-testid="basic-gated">Retained</span>
          }
          <button ogDialogClose data-testid="basic-close">Close</button>
          <button
            type="button"
            data-testid="basic-dismissible"
            (click)="basicDismissible.set(!basicDismissible())"
          >
            Toggle dismissible
          </button>
          <button
            type="button"
            data-testid="basic-request-close"
            (click)="basicElement.requestClose()"
          >
            Request close
          </button>
          <button type="button" data-testid="basic-native-close" (click)="basicElement.close()">
            Close natively
          </button>
          <form method="dialog">
            <button data-testid="basic-submit">Submit natively</button>
          </form>
        </dialog>
      </div>
      <button type="button" data-testid="open-basic" (click)="basicOpen.set(true)">
        Open by model
      </button>
      <output data-testid="basic-open">{{ basicOpen() }}</output>
      <output data-testid="basic-outputs">{{ basicOutputs() }}</output>
      <output data-testid="basic-cancels">{{ basicCancels() }}</output>
      <output data-testid="basic-state"
        >{{ basic.state.open() }} {{ basic.state.dismissible() }}
        {{ basicContent.state.open() }}</output
      >
      <div ogDialog>
        <button ogDialogTrigger data-testid="disabled-trigger" disabled focusableWhenDisabled>
          Disabled trigger
        </button>
        <dialog ogDialogContent data-testid="disabled-content">
          <button ogDialogClose disabled data-testid="disabled-close">Close</button>
        </dialog>
      </div>
    </section>

    <section>
      <h2>Motion</h2>
      <div ogDialog [(open)]="motionOpen">
        <dialog
          ogDialogContent
          class="motion"
          data-testid="motion-content"
          (close)="motionCloses.update(increment)"
        >
          <h2 ogDialogTitle>Motion dialog</h2>
          <button ogDialogClose data-testid="motion-close">Close</button>
          <button type="button" data-testid="motion-reopen" (click)="motionOpen.set(true)">
            Reopen
          </button>
        </dialog>
      </div>
      <button type="button" data-testid="open-motion" (click)="motionOpen.set(true)">
        Open motion
      </button>
      <output data-testid="motion-closes">{{ motionCloses() }}</output>
      <div ogDialog [(open)]="retainedOpen">
        <dialog ogDialogContent class="motion" data-testid="retained-content">
          <h2 ogDialogTitle>Retained child dialog</h2>
          <button ogDialogClose data-testid="retained-close">Close</button>
          <div ogPopover [(open)]="retainedPopoverOpen">
            <button ogPopoverTrigger ogPopoverAnchor data-testid="retained-popover-trigger">
              Choose
            </button>
            <div
              ogPopoverContent
              class="panel slow"
              data-testid="retained-popover-content"
              role="group"
              aria-label="Slow choices"
            >
              Slow
            </div>
          </div>
          <button
            type="button"
            data-testid="retained-close-popover"
            (click)="retainedPopoverOpen.set(false)"
          >
            Close popover
          </button>
        </dialog>
      </div>
      <button type="button" data-testid="open-retained" (click)="retainedOpen.set(true)">
        Open retained
      </button>
      <output data-testid="retained-state">{{ retainedOpen() }} {{ retainedPopoverOpen() }}</output>
    </section>

    <section>
      <h2>Layers</h2>
      <div ogDialog [(open)]="layeredOpen" [dismissible]="layeredDismissible()">
        <dialog
          ogDialogContent
          #layeredElement
          data-testid="layered-content"
          (cancel)="layeredCancels.update(increment)"
        >
          <h2 ogDialogTitle>Layered dialog</h2>
          <div ogPopover [(open)]="innerPopoverOpen">
            <button ogPopoverTrigger ogPopoverAnchor data-testid="inner-popover-trigger">
              Choose
            </button>
            <div
              ogPopoverContent
              class="panel"
              data-testid="inner-popover-content"
              role="group"
              aria-label="Choices"
            >
              <button type="button" data-testid="inner-popover-button">Choice</button>
            </div>
          </div>
          <div ogTooltip [(open)]="innerTooltipOpen">
            <button
              type="button"
              ogTooltipTrigger
              aria-label="Info"
              data-testid="inner-tooltip-trigger"
            >
              i
            </button>
            <span ogTooltipContent class="panel" data-testid="inner-tooltip-content">Tip</span>
          </div>
          <button type="button" data-testid="layered-inside">Inside</button>
          <button ogDialogClose data-testid="layered-close">Close</button>
          <button
            type="button"
            data-testid="layered-open-popover"
            (click)="innerPopoverOpen.set(true)"
          >
            Open popover
          </button>
          <button
            type="button"
            data-testid="layered-open-tooltip"
            (click)="innerTooltipOpen.set(true)"
          >
            Open tooltip
          </button>
          <button
            type="button"
            data-testid="layered-request-close"
            (click)="layeredElement.requestClose()"
          >
            Request close
          </button>
        </dialog>
      </div>
      <button type="button" data-testid="open-layered" (click)="layeredOpen.set(true)">
        Open layered
      </button>
      <button
        type="button"
        data-testid="layered-dismissible"
        (click)="layeredDismissible.set(!layeredDismissible())"
      >
        Toggle layered dismissible
      </button>
      <output data-testid="layered-state"
        >{{ layeredOpen() }} {{ innerPopoverOpen() }} {{ innerTooltipOpen() }}</output
      >
      <output data-testid="layered-cancels">{{ layeredCancels() }}</output>
    </section>

    <section>
      <h2>Nested dialogs</h2>
      <div ogDialog [(open)]="outerOpen">
        <dialog ogDialogContent data-testid="outer-content">
          <h2 ogDialogTitle>Outer dialog</h2>
          <button type="button" data-testid="open-inner" (click)="innerOpen.set(true)">
            Open inner
          </button>
          <button type="button" data-testid="open-sibling" (click)="siblingOpen.set(true)">
            Open sibling
          </button>
          <div ogDialog [(open)]="innerOpen">
            <button ogDialogTrigger data-testid="inner-trigger">Inner trigger</button>
            <dialog ogDialogContent data-testid="inner-content" [returnFocus]="outsideButton">
              <h2 ogDialogTitle>Inner dialog</h2>
              <button ogDialogClose data-testid="inner-close">Close inner</button>
            </dialog>
          </div>
        </dialog>
      </div>
      <div ogDialog [(open)]="siblingOpen">
        <dialog ogDialogContent data-testid="sibling-content">
          <h2 ogDialogTitle>Sibling dialog</h2>
          <button type="button" data-testid="sibling-inside">Inside sibling</button>
        </dialog>
      </div>
      <button type="button" data-testid="open-outer" (click)="outerOpen.set(true)">
        Open outer
      </button>
      <output data-testid="nested-state"
        >{{ outerOpen() }} {{ innerOpen() }} {{ siblingOpen() }}</output
      >
    </section>

    <section>
      <h2>Nested closes</h2>
      <div ogDialog [(open)]="chainOuterOpen">
        <dialog ogDialogContent class="motion" data-testid="chain-outer-content" #chainOuterElement>
          <h2 ogDialogTitle>Outer dialog with an exit</h2>
          <button type="button" data-testid="open-chain-inner" (click)="chainInnerOpen.set(true)">
            Open inner
          </button>
          <button type="button" data-testid="close-chain-outer" (click)="chainOuterOpen.set(false)">
            Close outer
          </button>
          <div ogDialog [(open)]="chainInnerOpen">
            <dialog
              ogDialogContent
              class="slow"
              data-testid="chain-inner-content"
              #chainInner="ogDialogContent"
            >
              <h2 ogDialogTitle>Inner dialog with a longer exit</h2>
              <button type="button" data-testid="close-chain-both" (click)="closeChain()">
                Close both
              </button>
              <button
                type="button"
                data-testid="request-close-chain-both"
                (click)="requestCloseChain(chainOuterElement)"
              >
                Request close of both
              </button>
              <button
                type="button"
                data-testid="close-chain-inner"
                (click)="chainInnerOpen.set(false)"
              >
                Close inner
              </button>
              @if (chainInner.state.open()) {
                <span data-testid="chain-inner-gated">Retained</span>
              }
            </dialog>
          </div>
        </dialog>
      </div>
      <button type="button" data-testid="open-chain-outer" (click)="chainOuterOpen.set(true)">
        Open outer with an exit
      </button>
      <output data-testid="chain-state">{{ chainOuterOpen() }} {{ chainInnerOpen() }}</output>
    </section>

    <section>
      <h2>Background layers</h2>
      <div ogDialog [(open)]="coveredOpen">
        <dialog ogDialogContent class="slow" data-testid="covered-content">
          <h2 ogDialogTitle>Dialog over a background Popover</h2>
          <button
            type="button"
            data-testid="covered-open-background"
            (click)="backgroundOpen.set(true)"
          >
            Open background popover
          </button>
          <button
            type="button"
            data-testid="covered-close-open-background"
            (click)="leaveCovered()"
          >
            Close and open background popover
          </button>
        </dialog>
      </div>
      <div ogPopover [(open)]="backgroundOpen" [dismissible]="backgroundDismissible()">
        <button ogPopoverTrigger ogPopoverAnchor data-testid="background-trigger">
          Background
        </button>
        <div
          ogPopoverContent
          class="panel"
          data-testid="background-content"
          role="group"
          aria-label="Background choices"
        >
          Background
        </div>
      </div>
      <button type="button" data-testid="open-covered" (click)="coveredOpen.set(true)">
        Open covering dialog
      </button>
      <button
        type="button"
        data-testid="background-dismissible"
        (click)="backgroundDismissible.set(!backgroundDismissible())"
      >
        Toggle background dismissible
      </button>
      <button type="button" data-testid="close-background" (click)="backgroundOpen.set(false)">
        Close background popover
      </button>
      <output data-testid="covered-state"
        >{{ coveredOpen() }} {{ backgroundOpen() }} {{ backgroundDismissible() }}</output
      >
    </section>

    <section>
      <h2>Shadow-root layers</h2>
      <div ogDialog [(open)]="shadowedOpen">
        <dialog ogDialogContent data-testid="shadowed-content">
          <h2 ogDialogTitle>Dialog over shadow-root layers</h2>
          <button
            type="button"
            data-testid="shadowed-open-tooltip"
            (click)="shadowTooltipOpen.set(true)"
          >
            Open tooltip
          </button>
          <button
            type="button"
            data-testid="shadowed-open-popover"
            (click)="shadowPopoverOpen.set(true)"
          >
            Open popover
          </button>
          <!-- Client-only: the shadow root isn't server-rendered. After the buttons, so the
               Tooltip Trigger doesn't take the dialog's initial focus. -->
          @if (attached()) {
            <dialog-shadow-layers
              [(tooltipOpen)]="shadowTooltipOpen"
              [(popoverOpen)]="shadowPopoverOpen"
            />
          }
        </dialog>
      </div>
      <button type="button" data-testid="open-shadowed" (click)="shadowedOpen.set(true)">
        Open shadowed
      </button>
      <output data-testid="shadowed-state"
        >{{ shadowedOpen() }} {{ shadowTooltipOpen() }} {{ shadowPopoverOpen() }}</output
      >
    </section>

    <section>
      <h2>Distributed layers</h2>
      <div ogDialog [(open)]="regionedOpen">
        <dialog ogDialogContent data-testid="regioned-content">
          <h2 ogDialogTitle>Dialog over a slotted region</h2>
          <button type="button" data-testid="regioned-close" (click)="regionedOpen.set(false)">
            Close
          </button>
          <!-- Client-only, as above. -->
          @if (attached()) {
            <div ogTooltip [(open)]="regionTooltipOpen">
              <button type="button" ogTooltipTrigger aria-label="Region info">i</button>
              <dialog-optional-region [(tooltipOpen)]="fallbackTooltipOpen">
                <span
                  ogTooltipContent
                  [attr.slot]="regionSlot()"
                  data-testid="region-tooltip-content"
                >
                  Region tip
                </span>
              </dialog-optional-region>
            </div>
          }
        </dialog>
      </div>
      <button type="button" data-testid="open-regioned" (click)="regionedOpen.set(true)">
        Open regioned
      </button>
      <button
        type="button"
        data-testid="regioned-open-region-tooltip"
        (click)="regionTooltipOpen.set(true)"
      >
        Open region tooltip
      </button>
      <button
        type="button"
        data-testid="regioned-open-fallback-tooltip"
        (click)="fallbackTooltipOpen.set(true)"
      >
        Open fallback tooltip
      </button>
      <button
        type="button"
        data-testid="regioned-close-tooltips"
        (click)="regionTooltipOpen.set(false); fallbackTooltipOpen.set(false)"
      >
        Close tooltips
      </button>
      @for (slot of regionSlots; track slot) {
        <button
          type="button"
          [attr.data-testid]="'region-slot-' + slot"
          (click)="regionSlot.set(slot)"
        >
          Assign the region to {{ slot }}
        </button>
      }
      <output data-testid="regioned-state"
        >{{ regionedOpen() }} {{ regionTooltipOpen() }} {{ fallbackTooltipOpen() }}</output
      >
    </section>

    <section>
      <h2>Slotted layers</h2>
      <!-- Client-only, as above: the slot-dialog's shadow root isn't server-rendered. -->
      @if (attached()) {
        <slot-dialog [(open)]="slottedOpen" [class.motion]="slottedMotion()">
          <button
            type="button"
            data-testid="slotted-open-tooltip"
            (click)="slottedTooltipOpen.set(true)"
          >
            Open tooltip
          </button>
          <button
            type="button"
            data-testid="slotted-open-popover"
            (click)="slottedPopoverOpen.set(true)"
          >
            Open popover
          </button>
          <div ogTooltip [(open)]="slottedTooltipOpen">
            <button
              type="button"
              ogTooltipTrigger
              aria-label="Info"
              data-testid="slotted-tooltip-trigger"
            >
              i
            </button>
            <span ogTooltipContent data-testid="slotted-tooltip-content">Tip</span>
          </div>
          <div ogPopover [(open)]="slottedPopoverOpen" [dismissible]="slottedPopoverDismissible()">
            <button ogPopoverTrigger ogPopoverAnchor data-testid="slotted-popover-trigger">
              Choose
            </button>
            <div
              ogPopoverContent
              data-testid="slotted-popover-content"
              role="group"
              aria-label="Slotted choices"
            >
              Choice
            </div>
          </div>
        </slot-dialog>
      }
      <button type="button" data-testid="open-slotted" (click)="slottedOpen.set(true)">
        Open slotted
      </button>
      <button type="button" data-testid="close-slotted" (click)="slottedOpen.set(false)">
        Close slotted
      </button>
      <button type="button" data-testid="slotted-motion" (click)="slottedMotion.set(true)">
        Give the slotted dialog an exit
      </button>
      <button
        type="button"
        data-testid="slotted-popover-dismissible"
        (click)="slottedPopoverDismissible.set(!slottedPopoverDismissible())"
      >
        Toggle slotted Popover dismissible
      </button>
      <output data-testid="slotted-state"
        >{{ slottedOpen() }} {{ slottedTooltipOpen() }} {{ slottedPopoverOpen() }}</output
      >
    </section>

    <section>
      <h2>Projected layers</h2>
      <projected-dialog [(open)]="projectedOpen">
        <button
          type="button"
          data-testid="projected-open-tooltip"
          (click)="projectedTooltipOpen.set(true)"
        >
          Open tooltip
        </button>
        <button
          type="button"
          data-testid="projected-open-popover"
          (click)="projectedPopoverOpen.set(true)"
        >
          Open popover
        </button>
        <button
          type="button"
          data-testid="projected-open-inner"
          (click)="projectedInnerOpen.set(true)"
        >
          Open inner dialog
        </button>
        <div ogTooltip [(open)]="projectedTooltipOpen">
          <button
            type="button"
            ogTooltipTrigger
            aria-label="Info"
            data-testid="projected-tooltip-trigger"
          >
            i
          </button>
          <span ogTooltipContent data-testid="projected-tooltip-content">Tip</span>
        </div>
        <div ogPopover [(open)]="projectedPopoverOpen">
          <button ogPopoverTrigger ogPopoverAnchor data-testid="projected-popover-trigger">
            Choose
          </button>
          <div
            ogPopoverContent
            data-testid="projected-popover-content"
            role="group"
            aria-label="Projected choices"
          >
            Choice
          </div>
        </div>
        <div ogDialog [(open)]="projectedInnerOpen">
          <dialog ogDialogContent data-testid="projected-inner-content">
            <h2 ogDialogTitle>Projected inner dialog</h2>
          </dialog>
        </div>
      </projected-dialog>
      <button type="button" data-testid="open-projected" (click)="projectedOpen.set(true)">
        Open projected
      </button>
      <button type="button" data-testid="close-projected" (click)="projectedOpen.set(false)">
        Close projected
      </button>
      <button
        type="button"
        data-testid="projected-close-inner"
        (click)="projectedInnerOpen.set(false)"
      >
        Close projected inner dialog
      </button>
      <output data-testid="projected-state"
        >{{ projectedOpen() }} {{ projectedTooltipOpen() }} {{ projectedPopoverOpen() }}</output
      >
      <output data-testid="projected-inner-state">{{ projectedInnerOpen() }}</output>
    </section>

    <section>
      <h2>Co-applied Popover roots</h2>
      <section
        ogPopover
        ogPopoverContent
        [(open)]="coappliedOpen"
        data-testid="coapplied-content"
        role="group"
        aria-label="Co-applied choices"
        class="panel"
      >
        <!-- An Anchor inside its own Content moves with it, so it's pinned to stay put. -->
        <button ogPopoverTrigger ogPopoverAnchor class="pinned" data-testid="coapplied-trigger">
          Close
        </button>
      </section>
      <button type="button" data-testid="open-coapplied" (click)="coappliedOpen.set(true)">
        Open co-applied
      </button>
      <output data-testid="coapplied-state">{{ coappliedOpen() }}</output>
      <div ogDialog [(open)]="coappliedDialogOpen">
        <dialog ogDialogContent data-testid="coapplied-dialog-content">
          <h2 ogDialogTitle>Dialog with a co-applied Popover</h2>
          <button
            type="button"
            data-testid="coapplied-dialog-open-popover"
            (click)="coappliedInnerOpen.set(true)"
          >
            Open popover
          </button>
          <button ogDialogClose data-testid="coapplied-dialog-close">Close</button>
          <section
            ogPopover
            ogPopoverContent
            [(open)]="coappliedInnerOpen"
            data-testid="coapplied-inner-content"
            role="group"
            aria-label="Co-applied inner choices"
            class="panel"
          >
            <button ogPopoverTrigger ogPopoverAnchor class="pinned">Close</button>
          </section>
        </dialog>
      </div>
      <button
        type="button"
        data-testid="open-coapplied-dialog"
        (click)="coappliedDialogOpen.set(true)"
      >
        Open dialog with a co-applied Popover
      </button>
      <output data-testid="coapplied-dialog-state"
        >{{ coappliedDialogOpen() }} {{ coappliedInnerOpen() }}</output
      >
      <div ogDialog [(open)]="hostedDialogOpen">
        <dialog
          ogDialogContent
          ogPopover
          [(open)]="hostedPopoverOpen"
          data-testid="hosted-dialog-content"
        >
          <h2 ogDialogTitle>Dialog that is a Popover root</h2>
          <button
            type="button"
            data-testid="hosted-open-popover"
            (click)="hostedPopoverOpen.set(true)"
          >
            Open popover
          </button>
          <button ogDialogClose data-testid="hosted-dialog-close">Close</button>
          <button ogPopoverTrigger ogPopoverAnchor data-testid="hosted-popover-trigger">
            Choose
          </button>
          <div
            ogPopoverContent
            data-testid="hosted-popover-content"
            role="group"
            aria-label="Hosted choices"
          >
            Choice
          </div>
        </dialog>
      </div>
      <button type="button" data-testid="open-hosted-dialog" (click)="hostedDialogOpen.set(true)">
        Open dialog that is a Popover root
      </button>
      <output data-testid="hosted-dialog-state"
        >{{ hostedDialogOpen() }} {{ hostedPopoverOpen() }}</output
      >
    </section>

    <section>
      <h2>Naming</h2>
      <div ogDialog>
        <dialog ogDialogContent data-testid="child-named-content">
          <dialog-heading />
        </dialog>
        <p ogDialogDescription>A Description outside Content describes nothing.</p>
      </div>
      <h3 id="static-label">Static label</h3>
      <div ogDialog>
        <dialog ogDialogContent aria-labelledby="static-label" data-testid="static-named-content">
          @if (titleMounted()) {
            <h2 ogDialogTitle id="toggled-title">Toggled title</h2>
          }
        </dialog>
      </div>
      <button type="button" data-testid="toggle-title" (click)="titleMounted.set(!titleMounted())">
        Toggle title
      </button>
      <div ogTooltip>
        <div ogDialog>
          <dialog ogDialogContent ogTooltipTrigger data-testid="described-content">
            <h2 ogDialogTitle>Described dialog</h2>
            <p ogDialogDescription id="described-description">What this dialog is for.</p>
          </dialog>
        </div>
        <span ogTooltipContent id="described-tip">A tooltip description.</span>
      </div>
    </section>

    <section>
      <h2>Focus</h2>
      <div ogDialog [(open)]="focusOpen">
        <button ogDialogTrigger data-testid="focus-trigger">Open focus</button>
        @if (focusMounted()) {
          <dialog ogDialogContent data-testid="focus-content" [returnFocus]="returnTo()">
            <h2 ogDialogTitle>Focus dialog</h2>
            <button ogDialogClose autofocus data-testid="focus-close">Close</button>
            <button type="button" data-testid="focus-return-next" (click)="returnTo.set(next)">
              Return to next
            </button>
            <button type="button" data-testid="focus-return-none" (click)="returnTo.set(null)">
              Return natively
            </button>
            <button type="button" data-testid="focus-unmount" (click)="focusMounted.set(false)">
              Remove dialog
            </button>
          </dialog>
        }
      </div>
      <button type="button" data-testid="focus-next" #next [disabled]="nextDisabled()">Next</button>
      <button type="button" data-testid="open-focus" (click)="focusOpen.set(true)">
        Open by model
      </button>
      <button type="button" data-testid="disable-next" (click)="nextDisabled.set(!nextDisabled())">
        Toggle next disabled
      </button>
      <button type="button" data-testid="remount-focus" (click)="focusMounted.set(true)">
        Remount
      </button>
      <output data-testid="focus-state">{{ focusOpen() }} {{ focusMounted() }}</output>
      <!-- Client-only: the shadow roots aren't server-rendered. -->
      @if (attached()) {
        <shadow-focus-dialog data-testid="shadow-focus" [(open)]="shadowFocusOpen" />
        <button type="button" data-testid="open-shadow-focus" (click)="shadowFocusOpen.set(true)">
          Open shadow focus by model
        </button>
        <shadow-focus-dialog data-testid="slotted-focus" [(open)]="slottedFocusOpen">
          <button type="button" data-testid="slotted-focus-target">Slotted</button>
        </shadow-focus-dialog>
        <button type="button" data-testid="open-slotted-focus" (click)="slottedFocusOpen.set(true)">
          Open slotted focus by model
        </button>
      }
    </section>

    <section>
      <h2>Composition</h2>
      <div
        factoryDialog
        [open]="true"
        [dismissible]="true"
        (openChange)="factoryOutputs.update(increment)"
      >
        <dialog factoryContent id="unused-own-id" data-testid="factory-content">
          <h2 ogDialogTitle>Factory dialog</h2>
          <button ogDialogClose data-testid="factory-close">Close</button>
        </dialog>
      </div>
      <button type="button" data-testid="open-factory" (click)="settings.open.set(true)">
        Open factory
      </button>
      <output data-testid="factory-state">{{ settings.open() }} {{ factoryOutputs() }}</output>
      <filters-sheet [(open)]="composedOpen" />
      <button type="button" data-testid="open-composed" (click)="composedOpen.set(true)">
        Open composed
      </button>
      <output data-testid="composed-open">{{ composedOpen() }}</output>
    </section>
  `,
  styles: `
    dialog {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }
    .motion[data-entering] {
      animation: dialog-enter 300ms linear;
    }
    .motion[data-leaving] {
      animation: dialog-leave 300ms linear forwards;
    }
    .slow[data-leaving] {
      animation: dialog-leave 1500ms linear forwards;
    }
    @keyframes dialog-enter {
      from {
        opacity: 0.2;
      }
    }
    @keyframes dialog-leave {
      to {
        opacity: 0.2;
      }
    }
    .pinned {
      position: fixed;
      top: 48px;
      right: 48px;
    }
    .panel {
      background: #333333;
      color: inherit;
      border: 1px solid #777777;
      padding: 8px;
    }
  `,
})
export class DialogFixture {
  readonly settings = inject(DialogSettings);
  readonly increment = increment;
  readonly attached = signal(false);
  readonly basicOpen = signal(false);
  readonly basicDismissible = signal(true);
  readonly basicOutputs = signal(0);
  readonly basicCancels = signal(0);
  readonly motionOpen = signal(false);
  readonly motionCloses = signal(0);
  readonly retainedOpen = signal(false);
  readonly retainedPopoverOpen = signal(false);
  readonly layeredOpen = signal(false);
  readonly layeredDismissible = signal(true);
  readonly layeredCancels = signal(0);
  readonly innerPopoverOpen = signal(false);
  readonly innerTooltipOpen = signal(false);
  readonly outerOpen = signal(false);
  readonly innerOpen = signal(false);
  readonly siblingOpen = signal(false);
  readonly chainOuterOpen = signal(false);
  readonly chainInnerOpen = signal(false);
  readonly coveredOpen = signal(false);
  readonly backgroundOpen = signal(false);
  readonly backgroundDismissible = signal(true);
  readonly shadowedOpen = signal(false);
  readonly shadowTooltipOpen = signal(false);
  readonly shadowPopoverOpen = signal(false);
  readonly slottedOpen = signal(false);
  readonly slottedTooltipOpen = signal(false);
  readonly slottedPopoverOpen = signal(false);
  readonly slottedPopoverDismissible = signal(true);
  readonly slottedMotion = signal(false);
  readonly projectedOpen = signal(false);
  readonly projectedTooltipOpen = signal(false);
  readonly projectedPopoverOpen = signal(false);
  readonly projectedInnerOpen = signal(false);
  readonly regionedOpen = signal(false);
  readonly regionTooltipOpen = signal(false);
  readonly fallbackTooltipOpen = signal(false);
  readonly regionSlots = ["visible", "inactive", "extra"];
  readonly regionSlot = signal("visible");
  readonly coappliedOpen = signal(false);
  readonly coappliedDialogOpen = signal(false);
  readonly coappliedInnerOpen = signal(false);
  readonly hostedDialogOpen = signal(false);
  readonly hostedPopoverOpen = signal(false);
  readonly titleMounted = signal(true);
  readonly focusOpen = signal(false);
  readonly focusMounted = signal(true);
  readonly shadowFocusOpen = signal(false);
  readonly slottedFocusOpen = signal(false);
  readonly returnTo = signal<HTMLElement | null>(null);
  readonly nextDisabled = signal(false);
  readonly factoryOutputs = signal(0);
  readonly composedOpen = signal(false);

  /** Y10: the inner Dialog first, then the outer, in one turn. */
  closeChain(): void {
    this.chainInnerOpen.set(false);
    this.chainOuterOpen.set(false);
  }

  /** Y11: the Dialog's exit starts, then a background Popover opens, in one turn. */
  leaveCovered(): void {
    this.coveredOpen.set(false);
    this.backgroundOpen.set(true);
  }

  /** Y10: a native close request on the outer Dialog, then the inner closed, in one turn. */
  requestCloseChain(outer: HTMLDialogElement): void {
    outer.requestClose();
    this.chainInnerOpen.set(false);
  }
}

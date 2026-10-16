import { Component, input, signal } from "@angular/core";
import {
  OrigamiCollapsible,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleTrigger,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";

// L5 V15: Collapsible and Popover parts rendered by sibling child components with bound IDs, so
// each part's association is first read before its counterpart's component view sets inputs.
// Rendered by the hydration unit and by the Node SSR checks.

@Component({
  selector: "acceptance-split-header",
  imports: [OrigamiCollapsibleTrigger],
  template: `
    <button ogCollapsibleTrigger [id]="triggerId()" data-testid="split-collapsible-trigger">
      Details
    </button>
  `,
})
export class SplitHeader {
  readonly triggerId = input.required<string>();
}

@Component({
  selector: "acceptance-split-body",
  imports: [OrigamiCollapsiblePanel],
  template: `
    <div ogCollapsiblePanel [id]="panelId()" data-testid="split-collapsible-panel">Details</div>
  `,
})
export class SplitBody {
  readonly panelId = input.required<string>();
}

@Component({
  selector: "acceptance-split-menu",
  imports: [OrigamiPopoverContent],
  template: `
    <section
      ogPopoverContent
      [id]="contentId()"
      role="group"
      aria-label="Split menu"
      data-testid="split-popover-content"
    >
      Menu
    </section>
  `,
})
export class SplitMenu {
  readonly contentId = input.required<string>();
}

/** The Panel's component renders after the Trigger's; the Content's after the Popover Trigger. */
@Component({
  selector: "acceptance-split-parts",
  imports: [
    OrigamiCollapsible,
    SplitHeader,
    SplitBody,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    SplitMenu,
  ],
  template: `
    <div ogCollapsible [(expanded)]="expanded">
      <acceptance-split-header [triggerId]="label() + '-split-trigger'" />
      <acceptance-split-body [panelId]="label() + '-split-panel'" />
    </div>
    <div ogPopover>
      <button
        ogPopoverTrigger
        ogPopoverAnchor
        [id]="label() + '-split-popover-trigger'"
        data-testid="split-popover-trigger"
      >
        Menu
      </button>
      <acceptance-split-menu [contentId]="label() + '-split-content'" />
    </div>
  `,
})
export class SplitParts {
  /** Distinguishes the bound IDs of several instances on one page. */
  readonly label = input.required<string>();
  readonly expanded = signal(true);
}

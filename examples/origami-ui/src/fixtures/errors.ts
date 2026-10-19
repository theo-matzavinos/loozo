import { Component, signal } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionItem } from "@loozo/origami-ui/collection";
import { OrigamiAccordionItem, OrigamiAccordionPanel } from "@loozo/origami-ui/accordion";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";
import { OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";
import { OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import {
  OrigamiToolbarRadioGroup,
  OrigamiToolbarToggleGroupMultiple,
  OrigamiToolbarToggleGroupSingle,
} from "@loozo/origami-ui/toolbar";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

/** Errors are mounted by genuine client actions; the server renders a valid starting page. */
@Component({
  selector: "acceptance-error-fixture",
  imports: [
    OrigamiCollection,
    OrigamiCollectionItem,
    OrigamiAccordionItem,
    OrigamiAccordionPanel,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiToolbarToggleGroupSingle,
    OrigamiToolbarToggleGroupMultiple,
    OrigamiToolbarRadioGroup,
    OrigamiToggleGroupItem,
    OrigamiRadioGroupItem,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
  ],
  template: `
    <h1>Clear ownership and configuration errors</h1>
    <label
      >Error case
      <select data-testid="error-case" (change)="choose($event)">
        <option value="none">None</option>
        <option value="orphan-collection">Orphan collection item</option>
        <option value="orphan-accordion">Orphan accordion item</option>
        <option value="accordion-with-collection">
          Accordion item with Collection but no Accordion owner
        </option>
        <option value="orphan-collapsible-trigger">Orphan collapsible trigger</option>
        <option value="orphan-collapsible-panel">Orphan collapsible panel</option>
        <option value="orphan-accordion-panel">Accordion panel under a Collapsible only</option>
        <option value="orphan-toolbar-toggle-group-single">
          Toolbar Single group outside a Toolbar
        </option>
        <option value="orphan-toolbar-toggle-group-multiple">
          Toolbar Multiple group outside a Toolbar
        </option>
        <option value="orphan-toolbar-radio-group">Toolbar Radio Group outside a Toolbar</option>
        <option value="trigger">Duplicate collapsible trigger</option>
        <option value="panel">Duplicate collapsible panel</option>
        <option value="popover-trigger">Duplicate popover trigger</option>
        <option value="popover-anchor">Duplicate popover anchor</option>
        <option value="popover-content">Duplicate popover content</option>
        <option value="negative-gap">Negative gap</option>
        <option value="nan-gap">NaN gap</option>
        <option value="infinite-gap">Infinite gap</option>
        <option value="orphan-tooltip-trigger">Orphan tooltip trigger</option>
        <option value="orphan-tooltip-content">Orphan tooltip content</option>
        <option value="tooltip-trigger">Duplicate tooltip trigger</option>
        <option value="tooltip-content">Duplicate tooltip content</option>
        <option value="tooltip-negative-gap">Negative tooltip gap</option>
        <option value="tooltip-nan-gap">NaN tooltip gap</option>
      </select></label
    >
    <button type="button" data-testid="mount-error" (click)="mount()">Mount invalid case</button>
    @if (mounted() && selected() === "orphan-collection") {
      <span ogCollectionItem>Orphan</span>
    }
    @if (mounted() && selected() === "orphan-accordion") {
      <article ogAccordionItem>Orphan</article>
    }
    @if (mounted() && selected() === "accordion-with-collection") {
      <section ogCollection data-testid="error-bare-collection">
        <article ogAccordionItem>Missing Accordion ancestor, valid Collection ancestor</article>
      </section>
    }
    @if (mounted() && selected() === "orphan-collapsible-trigger") {
      <button ogCollapsibleTrigger>Orphan trigger</button>
    }
    @if (mounted() && selected() === "orphan-collapsible-panel") {
      <div ogCollapsiblePanel>Orphan panel</div>
    }
    @if (mounted() && selected() === "orphan-accordion-panel") {
      <section ogCollapsible><div ogAccordionPanel>Missing Accordion Item ancestor</div></section>
    }
    @if (mounted() && selected() === "orphan-toolbar-toggle-group-single") {
      <div ogToolbarToggleGroupSingle>
        <button ogToggleGroupItem value="a">Missing Toolbar</button>
      </div>
    }
    @if (mounted() && selected() === "orphan-toolbar-toggle-group-multiple") {
      <div ogToolbarToggleGroupMultiple>
        <button ogToggleGroupItem value="a">Missing Toolbar</button>
      </div>
    }
    @if (mounted() && selected() === "orphan-toolbar-radio-group") {
      <div ogToolbarRadioGroup><button ogRadioGroupItem value="a">Missing Toolbar</button></div>
    }
    @if (mounted() && selected() === "orphan-tooltip-trigger") {
      <button ogTooltipTrigger>Orphan tooltip trigger</button>
    }
    @if (mounted() && selected() === "orphan-tooltip-content") {
      <span ogTooltipContent>Orphan tooltip content</span>
    }
    <span ogTooltip [open]="mounted()">
      <button ogTooltipTrigger>First tooltip trigger</button>
      <span ogTooltipContent [gap]="tooltipGap()">First tooltip content</span>
      @if (mounted() && selected() === "tooltip-trigger") {
        <button ogTooltipTrigger>Second tooltip trigger</button>
      }
      @if (mounted() && selected() === "tooltip-content") {
        <span ogTooltipContent>Second tooltip content</span>
      }
    </span>
    <section ogCollapsible>
      <button ogCollapsibleTrigger>First trigger</button>
      <div ogCollapsiblePanel>First panel</div>
      @if (mounted() && selected() === "trigger") {
        <button ogCollapsibleTrigger>Second trigger</button>
      }
      @if (mounted() && selected() === "panel") {
        <div ogCollapsiblePanel>Second panel</div>
      }
    </section>
    <section ogPopover [open]="mounted()">
      <button ogPopoverTrigger>First trigger</button><span ogPopoverAnchor>First anchor</span>
      <section ogPopoverContent [gap]="gap()">First content</section>
      @if (mounted() && selected() === "popover-trigger") {
        <button ogPopoverTrigger>Second trigger</button>
      }
      @if (mounted() && selected() === "popover-anchor") {
        <span ogPopoverAnchor>Second anchor</span>
      }
      @if (mounted() && selected() === "popover-content") {
        <section ogPopoverContent>Second content</section>
      }
    </section>
  `,
})
export class ErrorFixture {
  readonly selected = signal("none");
  readonly mounted = signal(false);
  readonly gap = signal(0);
  readonly tooltipGap = signal(0);

  choose(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected error-case select");
    }

    this.selected.set(event.target.value);
    this.gap.set(0);
    this.tooltipGap.set(0);
  }

  mount(): void {
    const selected = this.selected();

    if (selected === "negative-gap") {
      this.gap.set(-1);
    }

    if (selected === "nan-gap") {
      this.gap.set(Number.NaN);
    }

    if (selected === "infinite-gap") {
      this.gap.set(Number.POSITIVE_INFINITY);
    }

    if (selected === "tooltip-negative-gap") {
      this.tooltipGap.set(-1);
    }

    if (selected === "tooltip-nan-gap") {
      this.tooltipGap.set(Number.NaN);
    }

    this.mounted.set(true);
  }
}

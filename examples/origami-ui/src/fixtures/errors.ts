import { Component, afterNextRender, signal } from "@angular/core";
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
import {
  OrigamiCalendar,
  OrigamiCalendarCell,
  OrigamiCalendarHeading,
} from "@loozo/origami-ui/calendar";
import { OrigamiDateField, OrigamiDateFieldInput } from "@loozo/origami-ui/date-field";
import { OrigamiNumberField, OrigamiNumberFieldInput } from "@loozo/origami-ui/number-field";
import { OrigamiOtpField, OrigamiOtpFieldInput } from "@loozo/origami-ui/otp-field";
import {
  OrigamiFileField,
  OrigamiFileFieldClear,
  OrigamiFileFieldDropZone,
  OrigamiFileFieldInput,
} from "@loozo/origami-ui/file-field";
import { OrigamiAvatar, OrigamiAvatarFallback, OrigamiAvatarImage } from "@loozo/origami-ui/avatar";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";

/** Errors are mounted by genuine client actions; the server renders a valid starting page. */
@Component({
  selector: "acceptance-error-fixture",
  // The lazy route hydrates after the shell attaches; the select's change before that isn't replayed.
  host: { "[attr.data-client-render-seen]": "clientRenderSeen()" },
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
    OrigamiCalendar,
    OrigamiCalendarCell,
    OrigamiCalendarHeading,
    OrigamiDateField,
    OrigamiDateFieldInput,
    OrigamiNumberField,
    OrigamiNumberFieldInput,
    OrigamiOtpField,
    OrigamiOtpFieldInput,
    OrigamiFileField,
    OrigamiFileFieldInput,
    OrigamiFileFieldDropZone,
    OrigamiFileFieldClear,
    OrigamiAvatar,
    OrigamiAvatarImage,
    OrigamiAvatarFallback,
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
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
        <option value="calendar-heading">Duplicate calendar heading</option>
        <option value="calendar-cell-level">Month cell in a calendar's days view</option>
        <option value="date-field-input">Duplicate date field Input</option>
        <option value="number-field-input">Duplicate number field Input</option>
        <option value="otp-field-input">Duplicate OTP field Input</option>
        <option value="file-field-input">Duplicate file field Input</option>
        <option value="orphan-file-field-input">Orphan file field Input</option>
        <option value="orphan-file-field-drop-zone">Orphan file field drop zone</option>
        <option value="orphan-file-field-clear">Orphan file field Clear</option>
        <option value="avatar-image">Duplicate avatar Image</option>
        <option value="orphan-avatar-image">Orphan avatar Image</option>
        <option value="orphan-avatar-fallback">Orphan avatar Fallback</option>
        <option value="scroll-area-viewport">Duplicate scroll area Viewport</option>
        <option value="scroll-area-content">Duplicate scroll area Content</option>
        <option value="scroll-area-vertical">Duplicate vertical scroll area Scrollbar</option>
        <option value="scroll-area-horizontal">Duplicate horizontal scroll area Scrollbar</option>
        <option value="scroll-area-thumb">Duplicate scroll area Thumb</option>
        <option value="orphan-scroll-area-viewport">Orphan scroll area Viewport</option>
        <option value="orphan-scroll-area-scrollbar">Orphan scroll area Scrollbar</option>
        <option value="orphan-scroll-area-thumb">Scroll area Thumb outside a Scrollbar</option>
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
    <section ogCalendar today="2026-10-27">
      <h2 ogCalendarHeading>First calendar heading</h2>
      @if (mounted() && selected() === "calendar-heading") {
        <h2 ogCalendarHeading>Second calendar heading</h2>
      }
      @if (mounted() && selected() === "calendar-cell-level") {
        <table>
          <tbody>
            <tr>
              <td ogCalendarCell date="2026-10" data-testid="error-calendar-cell">Oct</td>
              <td ogCalendarCell date="2026-10-27" data-testid="error-calendar-day">27</td>
            </tr>
          </tbody>
        </table>
      }
    </section>
    <section ogDateField>
      <div ogDateFieldInput></div>
      @if (mounted() && selected() === "date-field-input") {
        <div ogDateFieldInput></div>
      }
    </section>
    <section ogNumberField>
      <input ogNumberFieldInput aria-label="First number" />
      @if (mounted() && selected() === "number-field-input") {
        <input ogNumberFieldInput aria-label="Second number" />
      }
    </section>
    <section ogOtpField>
      <input ogOtpFieldInput aria-label="First code" />
      @if (mounted() && selected() === "otp-field-input") {
        <input ogOtpFieldInput aria-label="Second code" />
      }
    </section>
    <section ogFileField>
      <input ogFileFieldInput aria-label="First file" />
      @if (mounted() && selected() === "file-field-input") {
        <input ogFileFieldInput aria-label="Second file" />
      }
    </section>
    @if (mounted() && selected() === "orphan-file-field-input") {
      <input ogFileFieldInput aria-label="Orphan file" />
    }
    @if (mounted() && selected() === "orphan-file-field-drop-zone") {
      <div ogFileFieldDropZone>Orphan drop zone</div>
    }
    @if (mounted() && selected() === "orphan-file-field-clear") {
      <button ogFileFieldClear>Orphan Clear</button>
    }
    <span ogAvatar>
      <img ogAvatarImage alt="" />
      @if (mounted() && selected() === "avatar-image") {
        <img ogAvatarImage alt="" />
      }
    </span>
    @if (mounted() && selected() === "orphan-avatar-image") {
      <img ogAvatarImage alt="" />
    }
    @if (mounted() && selected() === "orphan-avatar-fallback") {
      <span ogAvatarFallback>OA</span>
    }
    <div ogScrollArea>
      <div ogScrollAreaViewport>
        <div ogScrollAreaContent>Scroll area</div>
      </div>
      <div ogScrollAreaScrollbar orientation="vertical"><div ogScrollAreaThumb></div></div>
      <div ogScrollAreaScrollbar orientation="horizontal">
        <div ogScrollAreaThumb></div>
        @if (mounted() && selected() === "scroll-area-thumb") {
          <div ogScrollAreaThumb></div>
        }
      </div>
      @if (mounted() && selected() === "scroll-area-viewport") {
        <div ogScrollAreaViewport>Second viewport</div>
      }
      @if (mounted() && selected() === "scroll-area-content") {
        <div ogScrollAreaContent>Second content</div>
      }
      @if (mounted() && selected() === "scroll-area-vertical") {
        <div ogScrollAreaScrollbar orientation="vertical"></div>
      }
      @if (mounted() && selected() === "scroll-area-horizontal") {
        <div ogScrollAreaScrollbar orientation="horizontal"></div>
      }
      @if (mounted() && selected() === "orphan-scroll-area-thumb") {
        <div ogScrollAreaThumb></div>
      }
    </div>
    @if (mounted() && selected() === "orphan-scroll-area-viewport") {
      <div ogScrollAreaViewport>Orphan viewport</div>
    }
    @if (mounted() && selected() === "orphan-scroll-area-scrollbar") {
      <div ogScrollAreaScrollbar></div>
    }
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
  readonly clientRenderSeen = signal(false);
  readonly selected = signal("none");
  readonly mounted = signal(false);
  readonly gap = signal(0);
  readonly tooltipGap = signal(0);

  constructor() {
    afterNextRender({ write: () => this.clientRenderSeen.set(true) });
  }

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

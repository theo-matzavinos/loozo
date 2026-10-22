import {
  Component,
  Directive,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from "@angular/core";
import { FormField, form, required } from "@angular/forms/signals";
import { OrigamiPresence } from "@loozo/origami-ui/presence";
import {
  OrigamiCollapsible,
  OrigamiCollapsibleTrigger,
  OrigamiCollapsiblePanel,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
  OrigamiAccordionState,
} from "@loozo/origami-ui/accordion";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsTrigger,
  OrigamiTabsPanel,
} from "@loozo/origami-ui/tabs";
import {
  OrigamiToggleGroupSingle,
  OrigamiToggleGroupMultiple,
  OrigamiToggleGroupItem,
} from "@loozo/origami-ui/toggle-group";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarPopoverTrigger,
  OrigamiToolbarToggle,
  OrigamiToolbarRadioGroup,
  OrigamiToolbarToggleGroupSingle,
  OrigamiToolbarToggleGroupMultiple,
  type OrigamiToolbarOrientation,
} from "@loozo/origami-ui/toolbar";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";
import {
  OrigamiField,
  OrigamiFieldControl,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { OrigamiSwitch } from "@loozo/origami-ui/switch";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { BoundFieldLabel, HintedFieldControl } from "../field.js";
import { RepeatedRoving } from "../repeated-roving.js";
import { SplitParts } from "../split-parts.js";

@Directive({
  selector: "[accordionObservation]",
  host: { "[attr.data-item-values]": "state.itemValues().join(',')" },
})
export class AccordionObservation {
  readonly state = inject(OrigamiAccordionState);
}

/** Imported only through deferred templates in the incremental-hydration fixture. */
@Component({
  selector: "acceptance-hydration-unit",
  imports: [
    OrigamiPresence,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    AccordionObservation,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiToggle,
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    RepeatedRoving,
    SplitParts,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupMultiple,
    OrigamiToggleGroupItem,
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToolbarPopoverTrigger,
    OrigamiToolbarToggle,
    OrigamiButton,
    OrigamiToolbarRadioGroup,
    OrigamiToolbarToggleGroupSingle,
    OrigamiToolbarToggleGroupMultiple,
    OrigamiRadioGroup,
    OrigamiRadioGroupItem,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldControl,
    OrigamiFieldDescription,
    OrigamiFieldError,
    BoundFieldLabel,
    HintedFieldControl,
    OrigamiCheckbox,
    OrigamiSwitch,
  ],
  host: {
    "[attr.data-unit]": "label()",
    "[id]": "generatedId",
    "[attr.data-generated-id]": "generatedId",
    "[attr.data-client-render-seen]": "clientRenderSeen()",
  },
  template: `
    <h2>{{ label() }}</h2>
    <button type="button" data-testid="hydrate-unit" (click)="interactionCount.update(increment)">
      Hydrate this block
    </button>
    <output data-testid="interaction-count">{{ interactionCount() }}</output>

    <!-- N14: a Tooltip, open only in B. Its Content sits beside the Trigger, over nothing,
         and nothing that opens later in the unit covers the Trigger. -->
    <div>
      <button type="button" data-testid="hydration-tooltip-before">Before the Tooltip</button>
      <span ogTooltip [(open)]="tooltipOpen" [openDelay]="150">
        <button
          type="button"
          ogTooltipTrigger
          aria-label="Theme"
          data-testid="hydration-tooltip-trigger"
        >
          T
        </button>
        <span ogTooltipContent side="inline-end" [gap]="8" data-testid="hydration-tooltip-content">
          Switch between light and dark
        </span>
      </span>
    </div>
    <button type="button" data-testid="hydration-tooltip-after">After the Tooltip</button>
    <output data-testid="hydration-tooltip-intent">{{ tooltipOpen() }}</output>

    <div ogPresence #presence="ogPresence" [(present)]="present" data-testid="hydration-presence">
      @if (presence.state.open()) {
        <p data-testid="hydration-presence-child">{{ label() }} retained server child</p>
      }
    </div>

    <div ogCollapsible [(expanded)]="expanded" (expandedChange)="expandedOutputs.update(increment)">
      <button ogCollapsibleTrigger data-testid="hydration-collapsible-trigger">
        Toggle server details
      </button>
      <div ogCollapsiblePanel data-testid="hydration-collapsible-panel">{{ label() }} details</div>
    </div>
    <output data-testid="expanded-output-count">{{ expandedOutputs() }}</output>

    <button
      ogToggle
      [(checked)]="pressed"
      (checkedChange)="pressedOutputs.update(increment)"
      data-testid="hydration-toggle"
    >
      Toggle server pressed
    </button>
    <output data-testid="pressed-output-count">{{ pressedOutputs() }}</output>

    <!-- M6: a Field bound to Signal Forms whose error B shows from the start (touched in
         ngOnInit), a Field whose Label comes after its control, and composed parts outside a
         Field whose static host attributes stay. -->
    <div ogField #contactField="ogField" data-testid="hydration-field">
      <label ogFieldLabel data-testid="hydration-field-label">Email</label>
      <input
        ogFieldControl
        type="email"
        data-testid="hydration-field-control"
        [formField]="contact.email"
      />
      <p ogFieldDescription data-testid="hydration-field-description">We never share it.</p>
      @if (contactField.state.errorsShown()) {
        <p ogFieldError data-testid="hydration-field-error">Enter your email.</p>
      }
    </div>
    <div ogField data-testid="hydration-field-after">
      <input ogFieldControl type="checkbox" data-testid="hydration-field-after-control" />
      <label ogFieldLabel data-testid="hydration-field-after-label">Remember me</label>
    </div>
    <label boundFieldLabel data-testid="hydration-field-composed-label">Composed</label>
    <input hintedFieldControl data-testid="hydration-field-composed-control" />

    <!-- J6 W6: a Checkbox with its Label before it and a Switch with its Label after it, each in
         a Field and bound to Signal Forms. -->
    <div ogField data-testid="hydration-checkbox-field">
      <label ogFieldLabel data-testid="hydration-checkbox-label">Accept the terms</label>
      <button ogCheckbox data-testid="hydration-checkbox" [formField]="contact.terms"></button>
      <p ogFieldDescription data-testid="hydration-checkbox-description">Required to continue.</p>
    </div>
    <output data-testid="hydration-checkbox-value">{{ contactModel().terms }}</output>
    <div ogField data-testid="hydration-switch-field">
      <button ogSwitch data-testid="hydration-switch" [formField]="contact.notify"></button>
      <label ogFieldLabel data-testid="hydration-switch-label">Order notifications</label>
      <p ogFieldDescription data-testid="hydration-switch-description">About your orders.</p>
    </div>
    <output data-testid="hydration-switch-value">{{ contactModel().notify }}</output>

    <!-- G8: a Toggle in a Field, bound to Signal Forms, with its Label before it. -->
    <div ogField data-testid="hydration-toggle-field">
      <label ogFieldLabel data-testid="hydration-toggle-label">Bold headings</label>
      <button ogToggle data-testid="hydration-field-toggle" [formField]="contact.bold">B</button>
      <p ogFieldDescription data-testid="hydration-toggle-description">Headings need emphasis.</p>
    </div>
    <output data-testid="hydration-toggle-value">{{ contactModel().bold }}</output>

    <!-- Q11 U12: groups in Fields, bound to Signal Forms, labelled by a Label before and after. -->
    <div ogField data-testid="hydration-radio-field">
      <span ogFieldLabel data-testid="hydration-radio-label">Delivery</span>
      <div ogRadioGroup data-testid="hydration-field-radio" [formField]="contact.delivery">
        <button ogRadioGroupItem value="pickup" data-testid="hydration-delivery-pickup">
          Pickup
        </button>
        <button ogRadioGroupItem value="courier" data-testid="hydration-delivery-courier">
          Courier
        </button>
      </div>
      <p ogFieldDescription data-testid="hydration-radio-description">Pickup is free.</p>
    </div>
    <output data-testid="hydration-delivery-value">{{ contactModel().delivery }}</output>
    <div ogField data-testid="hydration-marks-field">
      <div ogToggleGroupMultiple data-testid="hydration-field-marks" [formField]="contact.marks">
        <button ogToggleGroupItem value="bold" data-testid="hydration-field-mark-bold">Bold</button>
        <button ogToggleGroupItem value="italic">Italic</button>
      </div>
      <span ogFieldLabel data-testid="hydration-marks-label">Title marks</span>
      <p ogFieldDescription data-testid="hydration-marks-description">Applied to the title.</p>
    </div>
    <output data-testid="hydration-marks-value">{{ contactModel().marks.join(",") }}</output>

    <div
      ogTabs
      [(value)]="tab"
      (valueChange)="tabOutputs.update(increment)"
      data-testid="hydration-tabs"
    >
      <div ogTabsList aria-label="Server tabs">
        <button
          ogTabsTrigger
          value="first"
          [disabled]="!initiallyPresent()"
          data-testid="hydration-tab-first"
        >
          First
        </button>
        <button ogTabsTrigger value="second" data-testid="hydration-tab-second">Second</button>
      </div>
      <div ogTabsPanel value="first" data-testid="hydration-panel-first">
        {{ label() }} first panel
      </div>
      <div ogTabsPanel value="second" data-testid="hydration-panel-second">
        {{ label() }} second panel
      </div>
    </div>
    <output data-testid="tab-output-count">{{ tabOutputs() }}</output>

    <!-- Registration order differs from DOM order: the conditional Trigger is constructed last. -->
    <div ogTabs data-testid="hydration-order-tabs">
      <div ogTabsList aria-label="Server order">
        @if (earlyTrigger()) {
          <button ogTabsTrigger value="early" data-testid="hydration-order-early">Early</button>
        }
        <button ogTabsTrigger value="one" data-testid="hydration-order-one">One</button>
        <button ogTabsTrigger value="two" data-testid="hydration-order-two">Two</button>
      </div>
    </div>

    <acceptance-repeated-roving [label]="label()" />
    <acceptance-split-parts [label]="label()" />

    <!-- Parts the browser creates after this unit hydrates: their generated IDs are client allocations. -->
    @if (clientRenderSeen()) {
      <div ogCollapsible>
        <button ogCollapsibleTrigger data-testid="client-only-trigger">Client details</button>
        <div ogCollapsiblePanel data-testid="client-only-panel">Client details</div>
      </div>
    }

    <div
      ogToggleGroupSingle
      [(value)]="alignment"
      aria-label="Server alignment"
      data-testid="hydration-alignment"
    >
      <button
        ogToggleGroupItem
        value="start"
        [disabled]="!initiallyPresent()"
        data-testid="hydration-align-start"
      >
        Start
      </button>
      <button
        ogToggleGroupItem
        value="end"
        [id]="'hydration-align-end-' + label()"
        data-testid="hydration-align-end"
      >
        End
      </button>
    </div>
    <div
      ogToggleGroupMultiple
      [(value)]="marks"
      (valueChange)="markOutputs.update(increment)"
      aria-label="Server formatting"
      data-testid="hydration-marks"
    >
      <button ogToggleGroupItem value="bold" data-testid="hydration-mark-bold">Bold</button>
      <button ogToggleGroupItem value="italic" data-testid="hydration-mark-italic">Italic</button>
      <button ogToggleGroupItem value="underline" data-testid="hydration-mark-underline">
        Underline
      </button>
    </div>
    <output data-testid="mark-output-count">{{ markOutputs() }}</output>

    <div
      ogToolbar
      [orientation]="toolbarOrientation()"
      aria-label="Server editing"
      data-testid="hydration-toolbar"
    >
      <button
        ogToolbarItem
        [disabled]="!initiallyPresent()"
        data-testid="hydration-toolbar-undo"
        (click)="undoCount.update(increment)"
      >
        Undo
      </button>
      <button ogToolbarItem data-testid="hydration-toolbar-redo">Redo</button>
      <div
        ogToolbarToggleGroupMultiple
        [(value)]="toolbarMarks"
        aria-label="Server toolbar marks"
        data-testid="hydration-toolbar-marks"
      >
        <button ogToggleGroupItem value="bold" data-testid="hydration-toolbar-bold">Bold</button>
        <button ogToggleGroupItem value="italic" data-testid="hydration-toolbar-italic">
          Italic
        </button>
      </div>
      <button
        ogToolbarItem
        data-testid="hydration-toolbar-clear"
        (click)="clearCount.update(increment)"
      >
        Clear
      </button>
    </div>
    <output data-testid="toolbar-clear-count">{{ clearCount() }}</output>
    <output data-testid="toolbar-undo-count">{{ undoCount() }}</output>
    <!-- The first control is a Toolbar group whose pressed item is not first. -->
    <div ogToolbar aria-label="Server group first" data-testid="hydration-group-toolbar">
      <div
        ogToolbarToggleGroupSingle
        [(value)]="toolbarAlignment"
        aria-label="Server toolbar alignment"
      >
        <button ogToggleGroupItem value="first" data-testid="hydration-group-first">First</button>
        <button ogToggleGroupItem value="second" data-testid="hydration-group-second">
          Second
        </button>
      </div>
      <button ogToolbarItem data-testid="hydration-group-after">After</button>
    </div>

    <div
      ogRadioGroup
      [(value)]="speed"
      (valueChange)="speedOutputs.update(increment)"
      aria-label="Server shipping speed"
      data-testid="hydration-speed"
    >
      <button
        ogRadioGroupItem
        value="standard"
        [disabled]="!initiallyPresent()"
        data-testid="hydration-speed-standard"
      >
        Standard
      </button>
      <button ogRadioGroupItem value="express" data-testid="hydration-speed-express">
        Express
      </button>
      <button ogRadioGroupItem value="same-day" data-testid="hydration-speed-same-day">
        Same day
      </button>
    </div>
    <output data-testid="speed-output-count">{{ speedOutputs() }}</output>
    <!-- The checked first radio is disabled, so the tab stop is the first enabled one. -->
    <div ogRadioGroup [(value)]="lockedSpeed" aria-label="Server locked speed">
      <button ogRadioGroupItem value="first" disabled data-testid="hydration-locked-first">
        First
      </button>
      <button ogRadioGroupItem value="second" data-testid="hydration-locked-second">Second</button>
    </div>
    <!-- A Toolbar Radio Group whose checked radio is not preferred. -->
    <div ogToolbar aria-label="Server alignment toolbar" data-testid="hydration-radio-toolbar">
      <button ogToolbarItem data-testid="hydration-radio-copy">Copy</button>
      <div ogToolbarRadioGroup [(value)]="toolbarRadio" aria-label="Server toolbar alignment">
        <button ogRadioGroupItem value="left" data-testid="hydration-radio-left">Left</button>
        <button ogRadioGroupItem value="center" data-testid="hydration-radio-center">Center</button>
      </div>
    </div>

    <!-- K10: a Toolbar Popover Trigger disabled by its own input. -->
    <button type="button" data-testid="hydration-format-before">Before the format toolbar</button>
    <div ogToolbar aria-label="Server format" data-testid="hydration-format-toolbar">
      <span ogPopover>
        <button
          ogToolbarPopoverTrigger
          ogPopoverAnchor
          [disabled]="initiallyPresent()"
          data-testid="hydration-format"
        >
          Format
        </button>
        <div
          ogPopoverContent
          role="group"
          aria-label="Server format options"
          data-testid="hydration-format-content"
        >
          Format options
        </div>
      </span>
      <button ogToolbarItem data-testid="hydration-format-bold">Bold</button>
    </div>

    <!-- F2: Buttons disabled in A and B, one of them focusable. -->
    <button
      ogButton
      [disabled]="initiallyPresent()"
      data-testid="hydration-button"
      (click)="buttonClicks.update(increment)"
    >
      Save
    </button>
    <button
      ogButton
      [disabled]="initiallyPresent()"
      focusableWhenDisabled
      data-testid="hydration-button-focusable"
      (click)="focusableButtonClicks.update(increment)"
    >
      Publish
    </button>
    <output data-testid="button-click-count">{{ buttonClicks() }}</output>
    <output data-testid="focusable-button-click-count">{{ focusableButtonClicks() }}</output>

    <!-- F5: a Toolbar Toggle, pressed in A and B, and a Toolbar Popover Trigger beside an item. -->
    <div ogToolbar aria-label="Server insert" data-testid="hydration-variants-toolbar">
      <button ogToolbarItem data-testid="hydration-variants-cut">Cut</button>
      <button
        ogToolbarToggle
        #spellingToggle="ogToolbarToggle"
        [(checked)]="spelling"
        (checkedChange)="spellingOutputs.update(increment)"
        data-testid="hydration-variants-spelling"
      >
        Spelling
      </button>
      <span ogPopover [(open)]="insertOpen">
        <button ogToolbarPopoverTrigger ogPopoverAnchor data-testid="hydration-variants-insert">
          Insert
        </button>
        <div
          ogPopoverContent
          role="group"
          aria-label="Server insert options"
          data-testid="hydration-variants-content"
        >
          Insert options
        </div>
      </span>
    </div>
    <output data-testid="hydration-variants-spelling-state">{{
      spellingToggle.state.checked()
    }}</output>
    <output data-testid="hydration-variants-spelling-outputs">{{ spellingOutputs() }}</output>
    <output data-testid="hydration-variants-insert-open">{{ insertOpen() }}</output>

    <!-- V16: a Popover Trigger disabled by its own input while the Popover stays enabled. -->
    <div ogPopover #share="ogPopover">
      <button
        ogPopoverTrigger
        ogPopoverAnchor
        [disabled]="initiallyPresent()"
        data-testid="hydration-share"
      >
        Share
      </button>
      <div
        ogPopoverContent
        role="group"
        aria-label="Server share options"
        data-testid="hydration-share-content"
      >
        Share options
      </div>
      <output data-testid="hydration-share-root-disabled">{{ share.state.disabled() }}</output>
    </div>

    <!-- L7 A7 A8 U8: the state composing directives expose, read through template references. -->
    <div ogCollapsible [expanded]="initiallyPresent()">
      <button ogCollapsibleTrigger data-testid="hydration-state-trigger">
        Server state details
      </button>
      <div ogCollapsiblePanel #statePanel="ogCollapsiblePanel" data-testid="hydration-state-panel">
        @if (statePanel.state.open()) {
          <p data-testid="hydration-state-panel-child">{{ label() }} retained Panel child</p>
        }
      </div>
    </div>
    <div ogAccordionSingle [(value)]="stateSelection" [collapsible]="true">
      <article ogAccordionItem #stateItem="ogAccordionItem" value="billing">
        <button ogAccordionTrigger data-testid="hydration-state-item-trigger">
          Server billing
        </button>
        <div
          ogAccordionPanel
          #stateItemPanel="ogAccordionPanel"
          data-testid="hydration-state-item-panel"
        >
          @if (stateItemPanel.state.open()) {
            <p data-testid="hydration-state-item-child">{{ label() }} retained Accordion child</p>
          }
        </div>
        <output data-testid="hydration-state-item-expanded">{{
          stateItem.state.expanded()
        }}</output>
      </article>
    </div>
    <div ogToggleGroupSingle [(value)]="stateAlignment" aria-label="Server state alignment">
      <button
        ogToggleGroupItem
        #stateStart="ogToggleGroupItem"
        value="start"
        data-testid="hydration-state-start"
      >
        Start
      </button>
    </div>
    <output data-testid="hydration-state-start-pressed">{{ stateStart.state.checked() }}</output>

    <div
      ogAccordionSingle
      accordionObservation
      [(value)]="selected"
      data-testid="hydration-accordion"
    >
      <article ogAccordionItem>
        <h3>
          <button ogAccordionTrigger data-testid="generated-item-one">Generated item one</button>
        </h3>
        <div ogAccordionPanel>First item</div>
      </article>
      <article ogAccordionItem>
        <h3>
          <button ogAccordionTrigger data-testid="generated-item-two">Generated item two</button>
        </h3>
        <div ogAccordionPanel>Second item</div>
      </article>
    </div>
    <output data-testid="generated-selection">{{ selected() }}</output>

    <div
      ogPopover
      [(open)]="popoverOpen"
      [dismissible]="dismissible()"
      (openChange)="popoverOutputs.update(increment)"
    >
      <button ogPopoverTrigger ogPopoverAnchor data-testid="hydration-popover-trigger">
        Toggle server Popover
      </button>
      <section
        ogPopoverContent
        #content="ogPopoverContent"
        class="surface"
        role="group"
        [attr.aria-label]="label()"
        data-testid="hydration-popover-content"
      >
        @if (content.state.open()) {
          <button type="button" data-testid="hydration-popover-child">
            {{ label() }} retained Popover child: {{ liveText() }}
          </button>
          <button
            type="button"
            data-testid="hydration-live-update"
            (click)="liveText.set('updated-after-attachment')"
          >
            Update retained binding
          </button>
        }
      </section>
    </div>
    <output data-testid="popover-intent">{{ popoverOpen() }}</output>
    <output data-testid="popover-output-count">{{ popoverOutputs() }}</output>
  `,
  styles: [
    `
      :host {
        display: block;
        color-scheme: dark;
        background: #141414;
        color: #eeeeee;
        padding: 1rem;
        font-family: system-ui, sans-serif;
      }
      button {
        margin: 0.25rem;
      }
      output {
        display: block;
      }
      .surface[data-entering] {
        animation: hydrated-enter 800ms linear;
      }
      .surface[data-leaving] {
        animation: hydrated-leave 800ms linear;
      }
      @keyframes hydrated-enter {
        from {
          opacity: 0.1;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes hydrated-leave {
        from {
          opacity: 1;
        }
        to {
          opacity: 0.1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .surface {
          animation: none !important;
        }
      }
      .surface {
        inline-size: 16rem;
        max-inline-size: calc(100vw - 24px);
        box-sizing: border-box;
        padding: 1rem;
        border: 1px solid #777777;
        background: #242424;
        color: #eeeeee;
      }
    `,
  ],
})
export class HydrationUnit {
  readonly label = input.required<string>();
  readonly initiallyPresent = input(true);
  /** Hydration-only fixture policy; protected unless a replay case makes one unit dismissible. */
  readonly dismissible = input(false);
  readonly generatedId = injectUniqueId("acceptance-repeated");
  readonly clientRenderSeen = signal(false);
  readonly present = linkedSignal(() => this.initiallyPresent());
  readonly expanded = linkedSignal(() => this.initiallyPresent());
  readonly popoverOpen = linkedSignal(() => this.initiallyPresent());
  readonly selected = signal<string | null>(null);
  readonly liveText = signal("initial");
  readonly interactionCount = signal(0);
  readonly expandedOutputs = signal(0);
  readonly pressed = linkedSignal(() => this.initiallyPresent());
  readonly pressedOutputs = signal(0);
  readonly tab = linkedSignal<string | null>(() => {
    if (this.initiallyPresent()) {
      return "first";
    }

    return null;
  });
  readonly tabOutputs = signal(0);
  readonly earlyTrigger = signal(true);
  readonly alignment = linkedSignal<string | null>(() => {
    if (this.initiallyPresent()) {
      return "start";
    }

    return null;
  });
  readonly marks = linkedSignal<readonly string[]>(() => {
    if (this.initiallyPresent()) {
      return ["bold", "italic"];
    }

    return [];
  });
  readonly markOutputs = signal(0);
  readonly stateSelection = linkedSignal<string | null>(() => {
    if (this.initiallyPresent()) {
      return "billing";
    }

    return null;
  });
  readonly stateAlignment = linkedSignal<string | null>(() => {
    if (this.initiallyPresent()) {
      return "start";
    }

    return null;
  });
  readonly toolbarOrientation = computed<OrigamiToolbarOrientation>(() => {
    if (this.initiallyPresent()) {
      return "horizontal";
    }

    return "vertical";
  });
  readonly toolbarMarks = linkedSignal<readonly string[]>(() => {
    if (this.initiallyPresent()) {
      return ["bold"];
    }

    return [];
  });
  readonly toolbarAlignment = signal<string | null>("second");
  readonly clearCount = signal(0);
  readonly undoCount = signal(0);
  readonly buttonClicks = signal(0);
  readonly focusableButtonClicks = signal(0);
  readonly spelling = linkedSignal(() => this.initiallyPresent());
  readonly spellingOutputs = signal(0);
  readonly insertOpen = signal(false);
  readonly speed = linkedSignal<string | null>(() => {
    if (this.initiallyPresent()) {
      return "express";
    }

    return null;
  });
  readonly speedOutputs = signal(0);
  readonly lockedSpeed = signal<string | null>("first");
  readonly toolbarRadio = signal<string | null>("center");
  readonly popoverOutputs = signal(0);
  readonly tooltipOpen = linkedSignal(() => this.label() === "B");
  readonly contactModel = signal<{
    email: string;
    terms: boolean;
    notify: boolean;
    bold: boolean;
    delivery: string | null;
    marks: string[];
  }>({ email: "", terms: false, notify: true, bold: false, delivery: null, marks: [] });
  readonly contact = form(this.contactModel, (path) => {
    required(path.email);
    required(path.terms);
    required(path.bold);
    required(path.delivery);
  });
  readonly increment = (value: number): number => value + 1;

  constructor() {
    // This diagnostic means this owner ran a client render callback, not that hydration is complete.
    afterNextRender({
      write: () => {
        this.clientRenderSeen.set(true);
      },
    });
  }

  /** B renders its Field error from the start, on the server and the client alike. */
  ngOnInit(): void {
    if (this.label() === "B") {
      this.contact.email().markAsTouched();
    }
  }
}

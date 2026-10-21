import { Component, Directive, Service, inject, signal } from "@angular/core";
import { OrigamiButton, OrigamiButtonOptions } from "@loozo/origami-ui/button";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import { OrigamiToggleGroupItem, OrigamiToggleGroupSingle } from "@loozo/origami-ui/toggle-group";
import {
  OrigamiAccordionItem,
  OrigamiAccordionPanel,
  OrigamiAccordionSingle,
  OrigamiAccordionTrigger,
} from "@loozo/origami-ui/accordion";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsPanel,
  OrigamiTabsTrigger,
} from "@loozo/origami-ui/tabs";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarPopoverTrigger,
  OrigamiToolbarToggle,
} from "@loozo/origami-ui/toolbar";

// F1 standalone Button and its replacement Options, F3 every button part's focusableWhenDisabled,
// F4 roving with focusable disabled items and F5 the Toolbar variants. Each case is identified by
// `data-button-case`.

@Service({ autoProvided: false })
export class ButtonPrecedenceSettings {
  readonly disabled = signal(true);
  readonly focusableWhenDisabled = signal(true);
}

/** Factory Options win over the composed Button's own inputs, exposed with contradicting values. */
@Directive({
  selector: "button[factoryButton]",
  hostDirectives: [{ directive: OrigamiButton, inputs: ["disabled", "focusableWhenDisabled"] }],
  providers: [OrigamiButtonOptions.provideFactory(() => inject(ButtonPrecedenceSettings))],
})
export class FactoryButton {}

/** Existing Options from the consumer's own class, with the same contradicting inputs. */
@Directive({
  selector: "button[existingButton]",
  hostDirectives: [{ directive: OrigamiButton, inputs: ["disabled", "focusableWhenDisabled"] }],
  providers: [OrigamiButtonOptions.provideExisting(() => ExistingButton)],
})
export class ExistingButton implements OrigamiButtonOptions {
  readonly #settings = inject(ButtonPrecedenceSettings);
  readonly disabled = this.#settings.disabled;
  readonly focusableWhenDisabled = this.#settings.focusableWhenDisabled;
}

@Component({
  selector: "acceptance-button-cases",
  imports: [
    OrigamiButton,
    FactoryButton,
    ExistingButton,
    OrigamiToggle,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupItem,
    OrigamiAccordionSingle,
    OrigamiAccordionItem,
    OrigamiAccordionTrigger,
    OrigamiAccordionPanel,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    OrigamiRadioGroup,
    OrigamiRadioGroupItem,
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiToolbarToggle,
    OrigamiToolbarPopoverTrigger,
  ],
  providers: [ButtonPrecedenceSettings],
  template: `
    <h2>Button</h2>
    <div data-button-case="standalone">
      <button type="button" data-role="before">Before the save button</button>
      <form (submit)="$event.preventDefault(); submits.update(increment)">
        <button
          ogButton
          [disabled]="saveDisabled()"
          [focusableWhenDisabled]="saveFocusable()"
          data-role="save"
          (click)="saveClicks.update(increment)"
        >
          Save
        </button>
      </form>
      <button type="button" data-role="after">After the save button</button>
      <output data-role="clicks">{{ saveClicks() }}</output>
      <output data-role="submits">{{ submits() }}</output>
      <button type="button" data-role="disable" (click)="saveDisabled.set(!saveDisabled())">
        Toggle save disabled
      </button>
      <button type="button" data-role="focusable" (click)="saveFocusable.set(!saveFocusable())">
        Toggle save focusable
      </button>
    </div>

    <h2>Button replacement precedence</h2>
    <div data-button-case="precedence">
      <button factoryButton [disabled]="false" [focusableWhenDisabled]="false" data-role="factory">
        Factory
      </button>
      <button existingButton [disabled]="false" [focusableWhenDisabled]="false" data-role="existing">
        Existing
      </button>
      <button
        type="button"
        data-role="disable"
        (click)="precedence.disabled.set(!precedence.disabled())"
      >
        Toggle replaced disabled
      </button>
      <button
        type="button"
        data-role="focusable"
        (click)="precedence.focusableWhenDisabled.set(!precedence.focusableWhenDisabled())"
      >
        Toggle replaced focusable
      </button>
    </div>

    <h2>Focusable disabled button parts</h2>
    <!-- Each part is disabled, by its root or itself, and focusable; its own click listener counts clicks. -->
    <div data-button-case="parts">
      <button
        ogToggle
        disabled
        focusableWhenDisabled
        [(checked)]="partPressed"
        data-role="toggle"
        (click)="count('toggle')"
      >
        Mute
      </button>
      <output data-role="toggle-value">{{ partPressed() }}</output>

      <div ogToggleGroupSingle [(value)]="partAlignment" disabled aria-label="Alignment">
        <button
          ogToggleGroupItem
          value="start"
          focusableWhenDisabled
          data-role="toggle-group-item"
          (click)="count('toggle-group-item')"
        >
          Start
        </button>
      </div>
      <output data-role="toggle-group-item-value">{{ partAlignment() }}</output>

      <div ogAccordionSingle [(value)]="partSection" disabled [collapsible]="true">
        <article ogAccordionItem value="billing">
          <button
            ogAccordionTrigger
            focusableWhenDisabled
            data-role="accordion-trigger"
            (click)="count('accordion-trigger')"
          >
            Billing
          </button>
          <div ogAccordionPanel>Billing details</div>
        </article>
      </div>
      <output data-role="accordion-trigger-value">{{ partSection() }}</output>

      <span ogPopover [(open)]="partOpen">
        <button
          ogPopoverTrigger
          ogPopoverAnchor
          disabled
          focusableWhenDisabled
          data-role="popover-trigger"
          (click)="count('popover-trigger')"
        >
          Share
        </button>
        <div ogPopoverContent role="group" aria-label="Share options">Share options</div>
      </span>
      <output data-role="popover-trigger-value">{{ partOpen() }}</output>

      <div ogTabs [(value)]="partTab">
        <div ogTabsList aria-label="Sections">
          <button ogTabsTrigger value="one" data-role="tabs-one">One</button>
          <button
            ogTabsTrigger
            value="two"
            disabled
            focusableWhenDisabled
            data-role="tabs-trigger"
            (click)="count('tabs-trigger')"
          >
            Two
          </button>
          <button ogTabsTrigger value="three" data-role="tabs-three">Three</button>
        </div>
        <div ogTabsPanel value="one">One</div>
        <div ogTabsPanel value="two">Two</div>
        <div ogTabsPanel value="three">Three</div>
      </div>
      <output data-role="tabs-trigger-value">{{ partTab() }}</output>

      <div ogRadioGroup [(value)]="partSpeed" aria-label="Delivery">
        <button ogRadioGroupItem value="standard" data-role="radio-standard">Ground</button>
        <button
          ogRadioGroupItem
          value="express"
          disabled
          focusableWhenDisabled
          data-role="radio-group-item"
          (click)="count('radio-group-item')"
        >
          Air
        </button>
        <button ogRadioGroupItem value="same-day" data-role="radio-same-day">Courier</button>
      </div>
      <output data-role="radio-group-item-value">{{ partSpeed() }}</output>

      <div ogToolbar aria-label="Editing" data-role="toolbar">
        <button ogToolbarItem data-role="cut">Cut</button>
        <button
          ogToolbarItem
          disabled
          focusableWhenDisabled
          data-role="toolbar-item"
          (click)="count('toolbar-item')"
        >
          Copy
        </button>
        <button
          ogToolbarToggle
          disabled
          focusableWhenDisabled
          [(checked)]="partSpelling"
          data-role="toolbar-toggle"
          (click)="count('toolbar-toggle')"
        >
          Spelling
        </button>
        <span ogPopover [(open)]="partInsertOpen">
          <button
            ogToolbarPopoverTrigger
            ogPopoverAnchor
            disabled
            focusableWhenDisabled
            data-role="toolbar-popover-trigger"
            (click)="count('toolbar-popover-trigger')"
          >
            Insert
          </button>
          <div ogPopoverContent role="group" aria-label="Insert options">Insert options</div>
        </span>
        <button ogToolbarItem data-role="paste">Paste</button>
      </div>
      <output data-role="toolbar-toggle-value">{{ partSpelling() }}</output>
      <output data-role="toolbar-popover-trigger-value">{{ partInsertOpen() }}</output>

      @for (part of parts; track part) {
        <output [attr.data-role]="part + '-clicks'">{{ clicks()[part] ?? 0 }}</output>
      }
    </div>

    <h2>Roving with focusable disabled items</h2>
    <div data-button-case="roving">
      <!-- A pressed focusable disabled item is not preferred; the first enabled item is. -->
      <div ogToggleGroupSingle [(value)]="rovingAlignment" aria-label="Roving alignment" data-role="group">
        <button
          ogToggleGroupItem
          value="start"
          [disabled]="rovingDisabled().includes('start')"
          [focusableWhenDisabled]="rovingFocusable().includes('start')"
          data-role="start"
          (keydown.d)="toggleRovingDisabled('start')"
        >
          Start
        </button>
        <button
          ogToggleGroupItem
          value="center"
          [disabled]="rovingDisabled().includes('center')"
          [focusableWhenDisabled]="rovingFocusable().includes('center')"
          data-role="center"
          (keydown.d)="toggleRovingDisabled('center')"
        >
          Center
        </button>
        <button
          ogToggleGroupItem
          value="end"
          [disabled]="rovingDisabled().includes('end')"
          [focusableWhenDisabled]="rovingFocusable().includes('end')"
          data-role="end"
          (keydown.d)="toggleRovingDisabled('end')"
        >
          End
        </button>
      </div>
      <output data-role="value">{{ rovingAlignment() }}</output>
      <button type="button" data-role="disable-all" (click)="rovingDisabled.set(['start', 'center', 'end'])">
        Disable every item
      </button>
      <button type="button" data-role="unfocusable-all" (click)="rovingFocusable.set([])">
        Make no item focusable
      </button>
    </div>

    <h2>Focusable disabled endpoints</h2>
    <!-- Each widget's first and last members are disabled but focusable, so Home and End reach them. -->
    <div data-button-case="endpoints">
      <div ogTabs [(value)]="endpointTab">
        <div ogTabsList aria-label="Endpoint sections" data-role="tabs">
          <button ogTabsTrigger value="first" disabled focusableWhenDisabled data-role="tabs-first">
            First
          </button>
          <button ogTabsTrigger value="middle" data-role="tabs-middle">Middle</button>
          <button ogTabsTrigger value="last" disabled focusableWhenDisabled data-role="tabs-last">
            Last
          </button>
        </div>
        <div ogTabsPanel value="first">First</div>
        <div ogTabsPanel value="middle">Middle</div>
        <div ogTabsPanel value="last">Last</div>
      </div>
      <output data-role="tabs-value">{{ endpointTab() }}</output>

      <div ogRadioGroup [(value)]="endpointSpeed" aria-label="Endpoint delivery" data-role="radio-group">
        <button ogRadioGroupItem value="ground" disabled focusableWhenDisabled data-role="radio-first">
          Ground
        </button>
        <button ogRadioGroupItem value="air" data-role="radio-middle">Air</button>
        <button ogRadioGroupItem value="courier" disabled focusableWhenDisabled data-role="radio-last">
          Courier
        </button>
      </div>
      <output data-role="radio-group-value">{{ endpointSpeed() }}</output>

      <div ogToolbar aria-label="Endpoint editing" data-role="toolbar">
        <button
          ogToolbarToggle
          disabled
          focusableWhenDisabled
          [(checked)]="endpointBold"
          data-role="toolbar-first"
        >
          Bold
        </button>
        <button ogToolbarItem data-role="toolbar-middle">Copy</button>
        <span ogPopover [(open)]="endpointInsertOpen">
          <button
            ogToolbarPopoverTrigger
            ogPopoverAnchor
            disabled
            focusableWhenDisabled
            data-role="toolbar-last"
          >
            Insert
          </button>
          <div ogPopoverContent role="group" aria-label="Endpoint insert options">Insert options</div>
        </span>
      </div>
      <output data-role="toolbar-first-value">{{ endpointBold() }}</output>
      <output data-role="toolbar-last-value">{{ endpointInsertOpen() }}</output>
    </div>
  `,
})
export class ButtonCases {
  readonly precedence = inject(ButtonPrecedenceSettings);
  readonly saveDisabled = signal(false);
  readonly saveFocusable = signal(false);
  readonly saveClicks = signal(0);
  readonly submits = signal(0);
  readonly partPressed = signal(false);
  readonly partAlignment = signal<string | null>(null);
  readonly partSection = signal<string | null>(null);
  readonly partOpen = signal(false);
  readonly partTab = signal<string | null>("one");
  readonly partSpeed = signal<string | null>("standard");
  readonly partSpelling = signal(false);
  readonly partInsertOpen = signal(false);
  readonly parts = [
    "toggle",
    "toggle-group-item",
    "accordion-trigger",
    "popover-trigger",
    "tabs-trigger",
    "radio-group-item",
    "toolbar-item",
    "toolbar-toggle",
    "toolbar-popover-trigger",
  ];
  readonly clicks = signal<Readonly<Record<string, number>>>({});
  readonly rovingAlignment = signal<string | null>("start");
  readonly rovingDisabled = signal<readonly string[]>(["start"]);
  readonly rovingFocusable = signal<readonly string[]>(["start", "center", "end"]);
  readonly endpointTab = signal<string | null>("middle");
  readonly endpointSpeed = signal<string | null>("air");
  readonly endpointBold = signal(false);
  readonly endpointInsertOpen = signal(false);
  readonly increment = (value: number): number => value + 1;

  count(part: string): void {
    this.clicks.update((clicks) => ({ ...clicks, [part]: (clicks[part] ?? 0) + 1 }));
  }

  toggleRovingDisabled(value: string): void {
    this.rovingDisabled.update((values) => {
      if (values.includes(value)) {
        return values.filter((candidate) => candidate !== value);
      }

      return [...values, value];
    });
  }
}

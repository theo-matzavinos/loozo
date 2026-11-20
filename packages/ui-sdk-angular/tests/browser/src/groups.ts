import { isPlatformBrowser } from "@angular/common";
import { Component, Directive, ElementRef, PLATFORM_ID, inject, signal } from "@angular/core";
import type { UiSdkEvent } from "@loozo/ui-sdk-angular";
import {
  UiCheckbox,
  UiCheckboxGroup,
  UiCheckboxGroupInput,
  UiCheckboxInput,
} from "@loozo/ui-sdk-angular/checkbox";
import {
  UiSelect,
  UiSelectContent,
  UiSelectGroup,
  UiSelectGroupLabel,
  UiSelectItem,
  UiSelectLabel,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
import { UiToggle, UiToggleGroup } from "@loozo/ui-sdk-angular/toggle";
import {
  UiToolbar,
  UiToolbarButton,
  UiToolbarGroup,
  UiToolbarInput,
  UiToolbarLink,
  UiToolbarSeparator,
} from "@loozo/ui-sdk-angular/toolbar";
import type { ToggleGroupOptions } from "@ui-sdk/core/toggle";
import { renderedFlag } from "./ready";

type ValueRequest = UiSdkEvent<NonNullable<ToggleGroupOptions["onValueChange"]>>;

/**
 * Group context: a Toolbar around a toggle, a toggle group, a ToolbarGroup (with a button, a
 * toggle and a nested toggle group) and a link and input; a vetoed toggle group; a Select with a
 * label and groups, and one whose trigger also has an `aria-label`; a CheckboxGroup with a parent
 * and `allValues`, and one without; a disabled Toolbar with a `(press)` and a `(click)` button.
 */
@Component({
  selector: "app-groups",
  imports: [
    UiToolbar,
    UiToolbarButton,
    UiToolbarGroup,
    UiToolbarInput,
    UiToolbarLink,
    UiToolbarSeparator,
    UiToggle,
    UiToggleGroup,
    UiSelect,
    UiSelectContent,
    UiSelectGroup,
    UiSelectGroupLabel,
    UiSelectItem,
    UiSelectLabel,
    UiSelectTrigger,
    UiSelectValue,
    UiCheckbox,
    UiCheckboxGroup,
    UiCheckboxGroupInput,
    UiCheckboxInput,
  ],
  template: `
    <div uiToolbar data-testid="toolbar" aria-label="Formatting" [disabled]="toolbarDisabled()">
      <button uiToggle data-testid="bold" aria-label="Bold">B</button>
      <div uiToggleGroup data-testid="align" aria-label="Alignment" [(value)]="align">
        <button uiToggle value="left" data-testid="align-left">Left</button>
        <button uiToggle value="center" data-testid="align-center">Center</button>
        <button uiToggle value="right" data-testid="align-right">Right</button>
      </div>
      <div uiToolbarSeparator data-testid="separator"></div>
      <div uiToolbarGroup data-testid="toolbar-group" [disabled]="groupDisabled()">
        <button uiToolbarButton data-testid="share" (press)="shares.set(shares() + 1)">
          Share
        </button>
        <button uiToggle data-testid="italic" aria-label="Italic">I</button>
        <div uiToggleGroup data-testid="list" aria-label="List" [multiple]="true">
          <button uiToggle value="bullets" data-testid="bullets">Bullets</button>
        </div>
      </div>
      <a uiToolbarLink href="#help" data-testid="help">Help</a>
      <input uiToolbarInput data-testid="size" aria-label="Size" value="12" />
    </div>
    <button
      type="button"
      data-testid="set-group-disabled"
      (click)="groupDisabled.set(!groupDisabled())"
    >
      Group disabled
    </button>
    <button
      type="button"
      data-testid="set-toolbar-disabled"
      (click)="toolbarDisabled.set(!toolbarDisabled())"
    >
      Toolbar disabled
    </button>
    <output data-testid="shares">{{ shares() }}</output>
    <output data-testid="align-value">{{ align().join(",") }}</output>

    <div
      uiToggleGroup
      data-testid="vetoed"
      aria-label="Vetoed"
      [multiple]="true"
      (valueChangeRequest)="veto($event)"
      (valueChange)="changes.set(changes() + 1)"
    >
      <button uiToggle value="a" data-testid="vetoed-a">A</button>
    </div>
    <output data-testid="veto-requests">{{ requests().join(" ") }}</output>
    <output data-testid="veto-changes">{{ changes() }}</output>

    <div uiSelect data-testid="fruit" defaultValue="lemon">
      <span uiSelectLabel data-testid="fruit-label">Fruit</span>
      <button uiSelectTrigger data-testid="fruit-trigger">
        <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span>
      </button>
      <div uiSelectContent>
        <div uiSelectGroup data-testid="citrus">
          <div uiSelectGroupLabel data-testid="citrus-label">Citrus</div>
          <div [uiSelectItem]="'lemon'" label="Lemon">Lemon</div>
          <div [uiSelectItem]="'lime'" label="Lime" data-testid="lime">Lime</div>
        </div>
        <div uiSelectGroup data-testid="berries">
          <div uiSelectGroupLabel data-testid="berries-label">Berries</div>
          <div [uiSelectItem]="'strawberry'" label="Strawberry">Strawberry</div>
        </div>
        <div [uiSelectItem]="'apple'" label="Apple">Apple</div>
      </div>
    </div>

    <div uiSelect data-testid="vegetable">
      <span uiSelectLabel>Vegetable</span>
      <button uiSelectTrigger aria-label="Vegetable">
        <span uiSelectValue #vegetable="uiSelectValue">{{ vegetable.state().label }}</span>
      </button>
      <div uiSelectContent>
        <div [uiSelectItem]="'kale'" label="Kale">Kale</div>
      </div>
    </div>

    <form data-testid="form" (submit)="$event.preventDefault()">
      <div
        uiCheckboxGroup
        data-testid="toppings"
        name="toppings"
        required
        aria-label="Toppings"
        [allValues]="toppings"
        [(value)]="chosen"
      >
        <button uiCheckbox parent data-testid="all" aria-label="All toppings"></button>
        @for (topping of toppings; track topping) {
          <button
            uiCheckbox
            #box="uiCheckbox"
            [value]="topping"
            [attr.data-testid]="topping"
            [attr.aria-label]="topping"
          ></button>
          <input [uiCheckboxInput]="box" />
        }
        <input uiCheckboxGroupInput />
      </div>
      <div uiCheckboxGroup data-testid="loose" aria-label="Loose" [defaultValue]="['a']">
        <button uiCheckbox parent data-testid="loose-all" aria-label="All loose"></button>
        <button uiCheckbox value="a" data-testid="loose-a" aria-label="a"></button>
        <button uiCheckbox value="b" data-testid="loose-b" aria-label="b"></button>
      </div>
    </form>
    <output data-testid="chosen">{{ chosen().join(",") }}</output>
    <button type="button" data-testid="set-chosen" (click)="chosen.set(['ham'])">Only ham</button>

    <div uiToolbar data-testid="off-toolbar" aria-label="Off" [disabled]="true">
      <button uiToolbarButton data-testid="off-press" (press)="presses.set(presses() + 1)">
        Press
      </button>
      <button uiToolbarButton data-testid="off-click" (click)="clicks.set(clicks() + 1)">
        Click
      </button>
    </div>
    <output data-testid="off-presses">{{ presses() }}</output>
    <output data-testid="off-clicks">{{ clicks() }}</output>
    <span data-testid="app-ready" [attr.data-ready]="ready()">groups</span>
  `,
})
export class Groups {
  protected readonly align = signal<string[]>(["left"]);
  protected readonly groupDisabled = signal(false);
  protected readonly toolbarDisabled = signal(false);
  protected readonly requests = signal<string[]>([]);
  protected readonly changes = signal(0);
  protected readonly toppings = ["cheese", "ham", "olives"];
  protected readonly chosen = signal<string[]>(["cheese"]);
  protected readonly shares = signal(0);
  protected readonly presses = signal(0);
  protected readonly clicks = signal(0);
  protected readonly ready = renderedFlag();

  protected veto(request: ValueRequest): void {
    this.requests.update((all) => [...all, request.value.join(",")]);
    request.details.cancel();
  }
}

/**
 * Fixture-only, listed before the package's directives: with `?earlyPress`, clicks its element
 * in a microtask after the creation pass, before the update pass and the first bind.
 */
@Directive({ selector: "[appEarlyClick]" })
export class AppEarlyClick {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    if (!isPlatformBrowser(inject(PLATFORM_ID)) || !location.search.includes("earlyPress")) {
      return;
    }

    queueMicrotask(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }
}

/**
 * Incremental only: a toggle group inside an eager Toolbar, and a Select with a group, each in a
 * hydrate-on-interaction block; and a Toolbar in one whose buttons AppEarlyClick clicks before
 * their first bind, with `?earlyPress`.
 */
@Component({
  selector: "app-groups-defer",
  imports: [
    AppEarlyClick,
    UiToolbar,
    UiToolbarButton,
    UiToggle,
    UiToggleGroup,
    UiSelect,
    UiSelectContent,
    UiSelectGroup,
    UiSelectGroupLabel,
    UiSelectItem,
    UiSelectLabel,
    UiSelectTrigger,
    UiSelectValue,
  ],
  template: `
    <div uiToolbar data-testid="toolbar" aria-label="Formatting">
      <button uiToolbarButton data-testid="first">First</button>
      @defer (hydrate on interaction) {
        <div uiToggleGroup data-testid="align" aria-label="Alignment" [defaultValue]="['center']">
          <button uiToggle value="left" data-testid="align-left">Left</button>
          <button uiToggle value="center" data-testid="align-center">Center</button>
        </div>
      }
    </div>
    @defer (hydrate on interaction) {
      <div uiSelect data-testid="fruit" defaultValue="lime">
        <span uiSelectLabel>Fruit</span>
        <button uiSelectTrigger data-testid="fruit-trigger">
          <span uiSelectValue #shown="uiSelectValue">{{ shown.state().label }}</span>
        </button>
        <div uiSelectContent>
          <div uiSelectGroup data-testid="citrus">
            <div uiSelectGroupLabel>Citrus</div>
            <div [uiSelectItem]="'lemon'" label="Lemon">Lemon</div>
            <div [uiSelectItem]="'lime'" label="Lime">Lime</div>
          </div>
        </div>
      </div>
    }
    @defer (hydrate on interaction) {
      <button type="button" data-testid="early-ready">Hydrate</button>
      <div uiToolbar data-testid="early-toolbar" aria-label="Early">
        <button
          appEarlyClick
          uiToolbarButton
          data-testid="early-on"
          (press)="presses.set(presses() + 1)"
        >
          On
        </button>
        <button
          appEarlyClick
          uiToolbarButton
          data-testid="early-off"
          [disabled]="true"
          (press)="presses.set(presses() + 10)"
        >
          Off
        </button>
      </div>
      <output data-testid="early-presses">{{ presses() }}</output>
    }
    <span data-testid="app-ready" [attr.data-ready]="ready()">groups defer</span>
  `,
})
export class GroupsDefer {
  protected readonly presses = signal(0);
  protected readonly ready = renderedFlag();
}

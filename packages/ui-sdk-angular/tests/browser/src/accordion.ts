import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import {
  UiAccordion,
  UiAccordionHeader,
  UiAccordionItem,
  UiAccordionPanel,
  UiAccordionTrigger,
} from "@loozo/ui-sdk-angular/accordion";
import { incremental } from "./mode";
import { type Request, invalidateBeforeBind, panelStyles, report, reportRequest } from "./panels";
import { renderedFlag } from "./ready";

/**
 * Accordions: `outer` (items with an item and a root veto, two made values, one kept, a disabled
 * toggle, a findable panel, and an open item with its own veto, a nested accordion and a stray
 * trigger),
 * `life` (destroyable), `multi` (multiple), `single`, `locked` (collapsible off), `controlled`
 * (`[value]` with a direct write, and a panel mount invalidated before its bind), `fenced`
 * (inside a disabled fieldset), and `kept-root` and `found-root` (a root `keepMounted` or
 * `hiddenUntilFound`, one closed panel inheriting it and one overriding it with `false`).
 */
@Component({
  selector: "app-accordion-cases",
  imports: [UiAccordion, UiAccordionItem, UiAccordionHeader, UiAccordionTrigger, UiAccordionPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: panelStyles,
  template: `
    <button
      type="button"
      data-testid="hydrate"
      (click)="wakes.set(wakes() + 1)"
      [attr.data-wakes]="wakes()"
    >
      Hydrate
    </button>
    <button type="button" data-testid="veto-outgoing" (click)="vetoOutgoing.set(true)">
      Outgoing item veto
    </button>
    <button type="button" data-testid="veto-item" (click)="vetoItem.set(true)">Item veto</button>
    <button type="button" data-testid="veto-root" (click)="vetoRoot.set(true)">Root veto</button>
    <button type="button" data-testid="toggle-y-disabled" (click)="yDisabled.set(!yDisabled())">
      Toggle Y
    </button>
    <button type="button" data-testid="misuse" (click)="misuse.set(true)">Stray trigger</button>
    <button type="button" data-testid="destroy" (click)="show.set(false)">Destroy</button>
    <button type="button" data-testid="set-controlled" (click)="controlled.set(['c1'])">
      Set controlled
    </button>
    <button type="button" data-testid="flicker" (click)="invalidate('c1-panel', openC1)">
      Flicker
    </button>
    <button type="button" data-testid="flicker-find" (click)="invalidate('c1-panel', findable.set)">
      Flicker findable
    </button>
    <button type="button" data-testid="remount-find" (click)="findable.set(true)">
      Mount findable
    </button>
    <button type="button" data-testid="unfind" (click)="findable.set(false)">
      Unmount findable
    </button>

    <div
      uiAccordion
      data-testid="outer"
      #outer="uiAccordion"
      [defaultValue]="openByDefault"
      (valueChangeRequest)="request('outer', 'valueChangeRequest', $event, vetoRoot())"
      (valueChange)="change('outer', $event, outer.state().value)"
    >
      <div
        uiAccordionItem
        value="x"
        data-probe="x-item"
        (openChangeRequest)="request('x', 'openChangeRequest', $event, vetoItem())"
        (openChangeComplete)="log('x', 'openChangeComplete', $event)"
      >
        <h3 uiAccordionHeader><button uiAccordionTrigger data-probe="x-trigger">X</button></h3>
        <div *uiAccordionPanel data-probe-panel data-probe="x-panel">X content</div>
      </div>
      <div
        uiAccordionItem
        data-probe="m-item"
        (openChangeComplete)="log('m', 'openChangeComplete', $event)"
      >
        <h3 uiAccordionHeader><button uiAccordionTrigger data-probe="m-trigger">Made</button></h3>
        <div *uiAccordionPanel data-probe-panel data-probe="m-panel">Made content</div>
      </div>
      <div uiAccordionItem data-probe="mk-item">
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="mk-trigger">Made, kept</button>
        </h3>
        <ng-template uiAccordionPanel keepMounted>
          <div data-probe-panel data-probe="mk-panel">Made, kept content</div>
        </ng-template>
      </div>
      <div uiAccordionItem value="y" data-probe="y-item" [disabled]="yDisabled()">
        <h3 uiAccordionHeader><button uiAccordionTrigger data-probe="y-trigger">Y</button></h3>
        <ng-template uiAccordionPanel #yPanel="uiAccordionPanel">
          <div data-probe-panel data-probe="y-panel">
            <output data-testid="y-disabled">{{ yPanel.state().disabled }}</output>
          </div>
        </ng-template>
      </div>
      <div
        uiAccordionItem
        value="f"
        data-probe="f-item"
        (openChangeRequest)="request('f', 'openChangeRequest', $event, vetoItem())"
        (openChangeComplete)="log('f', 'openChangeComplete', $event)"
      >
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="f-trigger">Findable</button>
        </h3>
        <ng-template uiAccordionPanel hiddenUntilFound>
          <div data-probe-panel data-probe="f-panel">Findable content</div>
        </ng-template>
      </div>
      <div
        uiAccordionItem
        value="open"
        data-probe="open-item"
        (openChangeRequest)="request('open', 'openChangeRequest', $event, vetoOutgoing())"
        (openChangeComplete)="log('open', 'openChangeComplete', $event)"
      >
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="open-trigger">Open</button>
        </h3>
        <div *uiAccordionPanel data-probe-panel data-probe="open-panel">
          <div
            uiAccordion
            data-testid="inner"
            #inner="uiAccordion"
            (valueChange)="change('inner', $event, inner.state().value)"
          >
            <div
              uiAccordionItem
              value="inner"
              (openChangeComplete)="log('inner', 'openChangeComplete', $event)"
            >
              <h4 uiAccordionHeader>
                <button uiAccordionTrigger data-probe="inner-trigger">Inner</button>
              </h4>
              <div *uiAccordionPanel data-probe-panel data-probe="inner-panel">Inner content</div>
            </div>
            @if (misuse()) {
              <div uiAccordion><button uiAccordionTrigger>Stray</button></div>
            }
          </div>
          <output data-testid="inner-state">{{ inner.state().value.join(" ") }}</output>
        </div>
      </div>
    </div>
    <output data-testid="outer-state">{{ outer.state().value.join(" ") }}</output>

    @if (show()) {
      <div uiAccordion data-testid="life">
        <div
          uiAccordionItem
          value="life"
          (openChangeComplete)="log('life', 'openChangeComplete', $event)"
        >
          <h3 uiAccordionHeader>
            <button uiAccordionTrigger data-probe="life-trigger">Life</button>
          </h3>
          <div *uiAccordionPanel data-probe-panel data-probe="life-panel">Life content</div>
        </div>
      </div>
    }

    <div uiAccordion data-testid="multi" #multi="uiAccordion" multiple>
      <div uiAccordionItem value="a">
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="multi-a-trigger">A</button>
        </h3>
        <div *uiAccordionPanel data-probe-panel data-probe="multi-a-panel">A content</div>
      </div>
      <div uiAccordionItem value="b">
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="multi-b-trigger">B</button>
        </h3>
        <div *uiAccordionPanel data-probe-panel data-probe="multi-b-panel">B content</div>
      </div>
    </div>
    <output data-testid="multi-state">{{ multi.state().value.join(" ") }}</output>

    <div uiAccordion data-testid="single" #single="uiAccordion">
      <div uiAccordionItem value="a">
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="single-a-trigger">A</button>
        </h3>
        <div *uiAccordionPanel data-probe-panel data-probe="single-a-panel">A content</div>
      </div>
      <div uiAccordionItem value="b">
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="single-b-trigger">B</button>
        </h3>
        <div *uiAccordionPanel data-probe-panel data-probe="single-b-panel">B content</div>
      </div>
    </div>
    <output data-testid="single-state">{{ single.state().value.join(" ") }}</output>

    <div
      uiAccordion
      data-testid="locked"
      #locked="uiAccordion"
      [collapsible]="false"
      [defaultValue]="lockedByDefault"
    >
      <div uiAccordionItem value="a">
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="locked-a-trigger">A</button>
        </h3>
        <div *uiAccordionPanel data-probe-panel data-probe="locked-a-panel">A content</div>
      </div>
      <div uiAccordionItem value="b">
        <h3 uiAccordionHeader>
          <button uiAccordionTrigger data-probe="locked-b-trigger">B</button>
        </h3>
        <div *uiAccordionPanel data-probe-panel data-probe="locked-b-panel">B content</div>
      </div>
    </div>
    <output data-testid="locked-state">{{ locked.state().value.join(" ") }}</output>

    <div
      uiAccordion
      data-testid="controlled"
      [value]="controlled()"
      (valueChange)="controlled.set($event)"
      (valueChangeRequest)="request('controlled', 'valueChangeRequest', $event, false)"
    >
      <div
        uiAccordionItem
        value="c1"
        (openChangeRequest)="request('c1', 'openChangeRequest', $event, false)"
        (openChangeComplete)="log('c1', 'openChangeComplete', $event)"
      >
        <h3 uiAccordionHeader><button uiAccordionTrigger data-probe="c1-trigger">C1</button></h3>
        <ng-template uiAccordionPanel [hiddenUntilFound]="findable()">
          <div data-probe-panel data-probe="c1-panel">C1 content</div>
        </ng-template>
      </div>
    </div>

    <fieldset disabled>
      <div uiAccordion data-testid="fenced">
        <div uiAccordionItem value="z">
          <h3 uiAccordionHeader>
            <button uiAccordionTrigger data-probe="fenced-trigger">Z</button>
          </h3>
          <div *uiAccordionPanel data-probe-panel data-probe="fenced-panel">Z content</div>
        </div>
      </div>
    </fieldset>

    @for (option of rootOptions; track option) {
      <div
        uiAccordion
        [attr.data-testid]="option + '-root'"
        [keepMounted]="option === 'kept'"
        [hiddenUntilFound]="option === 'found'"
      >
        <div uiAccordionItem value="inherit" [attr.data-probe]="option + '-inherit-item'">
          <h3 uiAccordionHeader>
            <button uiAccordionTrigger [attr.data-probe]="option + '-inherit-trigger'">
              Inherits
            </button>
          </h3>
          <div *uiAccordionPanel data-probe-panel [attr.data-probe]="option + '-inherit-panel'">
            Inherited content
          </div>
        </div>
        <div uiAccordionItem value="override" [attr.data-probe]="option + '-override-item'">
          <h3 uiAccordionHeader>
            <button uiAccordionTrigger [attr.data-probe]="option + '-override-trigger'">
              Overrides
            </button>
          </h3>
          <ng-template uiAccordionPanel [keepMounted]="false" [hiddenUntilFound]="false">
            <div data-probe-panel [attr.data-probe]="option + '-override-panel'">
              Overriding content
            </div>
          </ng-template>
        </div>
      </div>
    }
  `,
})
export class AccordionCases {
  protected readonly wakes = signal(0);
  protected readonly vetoOutgoing = signal(false);
  protected readonly vetoItem = signal(false);
  protected readonly vetoRoot = signal(false);
  protected readonly yDisabled = signal(false);
  protected readonly misuse = signal(false);
  protected readonly show = signal(true);
  protected readonly controlled = signal<string[]>([]);
  protected readonly findable = signal(false);
  protected readonly invalidate = invalidateBeforeBind();
  protected readonly openC1 = (open: boolean) => {
    if (open) {
      this.controlled.set(["c1"]);

      return;
    }

    this.controlled.set([]);
  };
  protected readonly openByDefault = ["open"];
  protected readonly rootOptions = ["kept", "found"];
  protected readonly lockedByDefault = ["a"];

  protected log(label: string, name: string, value: unknown): void {
    report({ name, label, value });
  }

  protected request(label: string, name: string, event: Request, veto: boolean): void {
    reportRequest(label, name, event, veto);
  }

  /** Reports a `valueChange` with the committed value its listener reads. */
  protected change(label: string, value: string[], committed: string[]): void {
    report({ name: "valueChange", label, value: [...value], previous: [...committed] });
  }
}

/** The Accordion cases, inside a `@defer (hydrate on interaction)` block in incremental mode. */
@Component({
  selector: "app-accordion-route",
  imports: [AccordionCases],
  template: `
    @if (deferred) {
      @defer (hydrate on interaction) {
        <app-accordion-cases />
      }
    } @else {
      <app-accordion-cases />
    }
    <span data-testid="app-ready" [attr.data-ready]="ready()">accordion</span>
  `,
})
export class AccordionRoute {
  protected readonly deferred = incremental;
  protected readonly ready = renderedFlag();
}

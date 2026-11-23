import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import {
  UiCollapsible,
  UiCollapsiblePanel,
  UiCollapsibleTrigger,
} from "@loozo/ui-sdk-angular/collapsible";
import { incremental } from "./mode";
import { type Request, invalidateBeforeBind, panelStyles, report, reportRequest } from "./panels";
import { renderedFlag } from "./ready";

/**
 * Collapsibles in every panel mode: `life` (default, closed; destroyable), `kept` (keepMounted),
 * `find` (hiddenUntilFound, with a veto), `open` (defaultOpen), `controlled` (`[open]` with a veto
 * and a direct write), `flicker` and `flicker-find` (a mount invalidated before its bind, then a
 * normal one), and `malformed` (two root elements) beside `valid`.
 */
@Component({
  selector: "app-collapsible-cases",
  imports: [UiCollapsible, UiCollapsibleTrigger, UiCollapsiblePanel],
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
    <button type="button" data-testid="veto" (click)="veto.set(true)">Veto</button>
    <button type="button" data-testid="destroy" (click)="show.set(false)">Destroy</button>
    <button type="button" data-testid="set-open" (click)="controlled.set(true)">Set open</button>
    <button
      type="button"
      data-testid="flicker"
      (click)="invalidate('flicker-panel', flickerOpen.set)"
    >
      Flicker
    </button>
    <button type="button" data-testid="reopen" (click)="flickerOpen.set(true)">Reopen</button>
    <button
      type="button"
      data-testid="flicker-find"
      (click)="invalidate('flicker-find-panel', findable.set)"
    >
      Flicker findable
    </button>
    <button type="button" data-testid="remount-find" (click)="findable.set(true)">
      Mount findable
    </button>
    <button type="button" data-testid="unfind" (click)="findable.set(false)">
      Unmount findable
    </button>

    @if (show()) {
      <div
        uiCollapsible
        data-testid="life"
        (openChangeRequest)="request('life', 'openChangeRequest', $event)"
        (openChange)="log('life', 'openChange', $event)"
        (openChangeComplete)="log('life', 'openChangeComplete', $event)"
      >
        <button uiCollapsibleTrigger data-probe="life-trigger">Life</button>
        <div *uiCollapsiblePanel data-probe-panel data-probe="life-panel">Life content</div>
      </div>
    }

    <div uiCollapsible data-testid="kept">
      <button uiCollapsibleTrigger data-probe="kept-trigger">Kept</button>
      <ng-template uiCollapsiblePanel keepMounted>
        <div data-probe-panel data-probe="kept-panel">Kept content</div>
      </ng-template>
    </div>

    <div
      uiCollapsible
      data-testid="find"
      #find="uiCollapsible"
      (openChangeRequest)="request('find', 'openChangeRequest', $event)"
      (openChangeComplete)="log('find', 'openChangeComplete', $event)"
    >
      <button uiCollapsibleTrigger data-probe="find-trigger">Find</button>
      <ng-template uiCollapsiblePanel hiddenUntilFound>
        <div data-probe-panel data-probe="find-panel">Findable content</div>
      </ng-template>
      <output data-testid="find-state">{{ find.state().open }}</output>
    </div>

    <div
      uiCollapsible
      data-testid="open"
      defaultOpen
      (openChangeComplete)="log('open', 'openChangeComplete', $event)"
    >
      <button uiCollapsibleTrigger data-probe="open-trigger">Open</button>
      <div *uiCollapsiblePanel data-probe-panel data-probe="open-panel">Open content</div>
    </div>

    <div
      uiCollapsible
      data-testid="controlled"
      [open]="controlled()"
      (openChange)="controlled.set($event)"
      (openChangeRequest)="request('controlled', 'openChangeRequest', $event)"
      (openChangeComplete)="log('controlled', 'openChangeComplete', $event)"
    >
      <button uiCollapsibleTrigger data-probe="controlled-trigger">Controlled</button>
      <div *uiCollapsiblePanel data-probe-panel data-probe="controlled-panel">
        Controlled content
      </div>
    </div>
    <output data-testid="controlled-state">{{ controlled() }}</output>

    <div
      uiCollapsible
      data-testid="flicker-root"
      [open]="flickerOpen()"
      (openChange)="flickerOpen.set($event)"
      (openChangeComplete)="log('flicker', 'openChangeComplete', $event)"
    >
      <button uiCollapsibleTrigger data-probe="flicker-trigger">Flicker</button>
      <div *uiCollapsiblePanel data-probe-panel data-probe="flicker-panel">Flicker content</div>
    </div>

    <div
      uiCollapsible
      data-testid="flicker-find-root"
      (openChangeRequest)="request('flicker-find', 'openChangeRequest', $event)"
      (openChangeComplete)="log('flicker-find', 'openChangeComplete', $event)"
    >
      <button uiCollapsibleTrigger data-probe="flicker-find-trigger">Flicker findable</button>
      <ng-template uiCollapsiblePanel [hiddenUntilFound]="findable()">
        <div data-probe-panel data-probe="flicker-find-panel">Flicker findable content</div>
      </ng-template>
    </div>

    <div uiCollapsible data-testid="malformed">
      <button uiCollapsibleTrigger data-probe="malformed-trigger">Malformed</button>
      <ng-template uiCollapsiblePanel>
        <div data-probe-panel data-probe="malformed-first">First</div>
        <div data-probe-panel data-probe="malformed-second">Second</div>
      </ng-template>
    </div>

    <div
      uiCollapsible
      data-testid="valid"
      (openChangeComplete)="log('valid', 'openChangeComplete', $event)"
    >
      <button uiCollapsibleTrigger data-probe="valid-trigger">Valid</button>
      <div *uiCollapsiblePanel data-probe-panel data-probe="valid-panel">Valid content</div>
    </div>
  `,
})
export class CollapsibleCases {
  protected readonly wakes = signal(0);
  protected readonly veto = signal(false);
  protected readonly show = signal(true);
  protected readonly controlled = signal(false);
  protected readonly flickerOpen = signal(false);
  protected readonly findable = signal(false);
  protected readonly invalidate = invalidateBeforeBind();

  protected log(label: string, name: string, value: unknown): void {
    report({ name, label, value });
  }

  protected request(label: string, name: string, event: Request): void {
    reportRequest(label, name, event, this.veto());
  }
}

/** The Collapsible cases, inside a `@defer (hydrate on interaction)` block in incremental mode. */
@Component({
  selector: "app-collapsible-route",
  imports: [CollapsibleCases],
  template: `
    @if (deferred) {
      @defer (hydrate on interaction) {
        <app-collapsible-cases />
      }
    } @else {
      <app-collapsible-cases />
    }
    <span data-testid="app-ready" [attr.data-ready]="ready()">collapsible</span>
  `,
})
export class CollapsibleRoute {
  protected readonly deferred = incremental;
  protected readonly ready = renderedFlag();
}

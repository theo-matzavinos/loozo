import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import {
  UiTabs,
  UiTabsIndicator,
  UiTabsList,
  UiTabsPanel,
  UiTabsTab,
  UiTabsTabIcon,
} from "@loozo/ui-sdk-angular/tabs";
import { incremental } from "./mode";
import { type Request, invalidateBeforeBind, panelStyles, report, reportRequest } from "./panels";
import { renderedFlag } from "./ready";

const layoutDirectives = [UiTabs, UiTabsList, UiTabsTab, UiTabsPanel];

/**
 * Tabs: `main` (A disabled, an icon, an indicator, a veto, `defaultValue` C), `manual`
 * (manual activation), `controlled` (`[(value)]`), `authored` (a tab and a panel with their own
 * ids), `find` (`hiddenUntilFound`, B selected, D's panel overriding it with `false`), `life`
 * (destroyable) and `flicker` (panel mounts invalidated before their bind, a default one and a
 * findable one).
 */
@Component({
  selector: "app-tabs-cases",
  imports: [...layoutDirectives, UiTabsTabIcon, UiTabsIndicator],
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
    <button
      type="button"
      data-testid="flicker"
      (click)="invalidate('flicker-two-panel', flickerTo)"
    >
      Flicker
    </button>
    <button type="button" data-testid="reselect" (click)="flickerValue.set('two')">
      Select two
    </button>
    <button
      type="button"
      data-testid="flicker-find"
      (click)="invalidate('flicker-three-panel', findable.set)"
    >
      Flicker findable
    </button>
    <button type="button" data-testid="remount-find" (click)="findable.set(true)">
      Mount findable
    </button>
    <button type="button" data-testid="unfind" (click)="findable.set(false)">
      Unmount findable
    </button>
    <button type="button" data-testid="select-none" (click)="controlled.set(null)">
      Select none
    </button>

    <div
      uiTabs
      data-testid="main"
      #main="uiTabs"
      defaultValue="C"
      (valueChangeRequest)="request('main', 'valueChangeRequest', $event)"
      (valueChange)="log('main', 'valueChange', $event)"
    >
      <div uiTabsList aria-label="Main" data-probe="main-list">
        <button uiTabsTab value="A" [disabled]="true" data-probe="main-A">A</button>
        <button uiTabsTab value="B" data-probe="main-B">B</button>
        <button uiTabsTab value="C" data-probe="main-C">
          C <span uiTabsTabIcon mirror data-probe="main-C-icon">→</span>
        </button>
        <button uiTabsTab value="D" data-probe="main-D">D</button>
        <span uiTabsIndicator data-probe="main-indicator"></span>
      </div>
      <div *uiTabsPanel="'A'" data-probe-panel data-probe="main-A-panel">A content</div>
      <div *uiTabsPanel="'B'" data-probe-panel data-probe="main-B-panel">B content</div>
      <div *uiTabsPanel="'C'" data-probe-panel data-probe="main-C-panel">C content</div>
      <div *uiTabsPanel="'D'" data-probe-panel data-probe="main-D-panel">D content</div>
    </div>
    <output data-testid="main-state">{{ main.state().value }}</output>

    <div uiTabs data-testid="manual" #manual="uiTabs" activation="manual" defaultValue="one">
      <div uiTabsList aria-label="Manual">
        <button uiTabsTab value="one" data-probe="manual-one">One</button>
        <button uiTabsTab value="two" data-probe="manual-two">Two</button>
      </div>
      <div *uiTabsPanel="'one'" data-probe-panel data-probe="manual-one-panel">One content</div>
      <div *uiTabsPanel="'two'" data-probe-panel data-probe="manual-two-panel">Two content</div>
    </div>
    <output data-testid="manual-state">{{ manual.state().value }}</output>

    <div uiTabs data-testid="controlled" [(value)]="controlled">
      <div uiTabsList aria-label="Controlled">
        <button uiTabsTab value="x" data-probe="controlled-x">X</button>
        <button uiTabsTab value="y" data-probe="controlled-y">Y</button>
      </div>
      <div *uiTabsPanel="'x'" data-probe-panel data-probe="controlled-x-panel">X content</div>
      <div *uiTabsPanel="'y'" data-probe-panel data-probe="controlled-y-panel">Y content</div>
    </div>
    <output data-testid="controlled-state">{{ controlled() }}</output>

    <div uiTabs data-testid="authored" defaultValue="one">
      <div uiTabsList aria-label="Authored">
        <button uiTabsTab value="one" id="authored-tab" data-probe="authored-one">One</button>
        <button uiTabsTab value="two" data-probe="authored-two">Two</button>
      </div>
      <div
        *uiTabsPanel="'one'"
        id="authored-panel"
        data-probe-panel
        data-probe="authored-one-panel"
      >
        One content
      </div>
      <div *uiTabsPanel="'two'" data-probe-panel data-probe="authored-two-panel">Two content</div>
    </div>

    <div
      uiTabs
      data-testid="find"
      #find="uiTabs"
      defaultValue="B"
      hiddenUntilFound
      (valueChangeRequest)="request('find', 'valueChangeRequest', $event)"
    >
      <div uiTabsList aria-label="Find" data-probe="find-list">
        <button uiTabsTab value="B" data-probe="find-B">B</button>
        <button uiTabsTab value="C" data-probe="find-C">C</button>
        <button uiTabsTab value="D" data-probe="find-D">D</button>
      </div>
      <div *uiTabsPanel="'B'" data-probe-panel data-probe="find-B-panel">B content</div>
      <div *uiTabsPanel="'C'" data-probe-panel data-probe="find-C-panel">Findable content</div>
      <ng-template uiTabsPanel="D" [hiddenUntilFound]="false">
        <div data-probe-panel data-probe="find-D-panel">Unfindable content</div>
      </ng-template>
    </div>
    <output data-testid="find-state">{{ find.state().value }}</output>

    @if (show()) {
      <div uiTabs data-testid="life" defaultValue="one">
        <div uiTabsList aria-label="Life">
          <button uiTabsTab value="one" data-probe="life-one">One</button>
          <button uiTabsTab value="two" data-probe="life-two">Two</button>
        </div>
        <div *uiTabsPanel="'one'" data-probe-panel data-probe="life-one-panel">One content</div>
        <div *uiTabsPanel="'two'" data-probe-panel data-probe="life-two-panel">Two content</div>
      </div>
    }

    <div
      uiTabs
      data-testid="flicker-root"
      [value]="flickerValue()"
      (valueChange)="flickerValue.set($event ?? 'one')"
      (valueChangeRequest)="request('flicker', 'valueChangeRequest', $event)"
    >
      <div uiTabsList aria-label="Flicker">
        <button uiTabsTab value="one" data-probe="flicker-one">One</button>
        <button uiTabsTab value="two" data-probe="flicker-two">Two</button>
        <button uiTabsTab value="three" data-probe="flicker-three">Three</button>
      </div>
      <div *uiTabsPanel="'one'" data-probe-panel data-probe="flicker-one-panel">One content</div>
      <div *uiTabsPanel="'two'" data-probe-panel data-probe="flicker-two-panel">Two content</div>
      <ng-template uiTabsPanel="three" [hiddenUntilFound]="findable()">
        <div data-probe-panel data-probe="flicker-three-panel">Three content</div>
      </ng-template>
    </div>
  `,
})
export class TabsCases {
  protected readonly wakes = signal(0);
  protected readonly veto = signal(false);
  protected readonly show = signal(true);
  protected readonly controlled = signal<string | null>("x");
  protected readonly flickerValue = signal("one");
  protected readonly findable = signal(false);
  protected readonly invalidate = invalidateBeforeBind();
  protected readonly flickerTo = (two: boolean) => {
    if (two) {
      this.flickerValue.set("two");

      return;
    }

    this.flickerValue.set("one");
  };

  protected log(label: string, name: string, value: unknown): void {
    report({ name, label, value });
  }

  protected request(label: string, name: string, event: Request): void {
    reportRequest(label, name, event, this.veto());
  }
}

/**
 * One Tabs per layout, tabs `[A disabled, B, C]`: (a) static list then static panels, (b) `@for`
 * tabs then `@for` panels, (c) `@for` tabs then static panels, (d) panels before the list, (c′)
 * and (d′) the same with `defaultValue` C, (e) `[value]="null"`, (f) `[value]="'A'"`, (g) every
 * tab disabled, (h) a mixed list: an enabled A inside `@if`, then static B and C, then static
 * panels.
 */
@Component({
  selector: "app-tabs-layouts",
  imports: layoutDirectives,
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
    <div
      uiTabs
      data-testid="layout"
      #root="uiTabs"
      [defaultValue]="defaultValue()"
      [value]="value()"
      (valueChangeRequest)="log('valueChangeRequest', $event.value)"
      (valueChange)="log('valueChange', $event)"
    >
      @switch (layout()) {
        @case ("b") {
          <div uiTabsList aria-label="Layout">
            @for (tab of tabs; track tab) {
              <button uiTabsTab [value]="tab" [disabled]="tab === 'A'" [attr.data-probe]="tab">
                {{ tab }}
              </button>
            }
          </div>
          @for (tab of tabs; track tab) {
            <div *uiTabsPanel="tab" data-probe-panel [attr.data-probe]="tab + '-panel'">
              {{ tab }} content
            </div>
          }
        }
        @case ("c") {
          <div uiTabsList aria-label="Layout">
            @for (tab of tabs; track tab) {
              <button uiTabsTab [value]="tab" [disabled]="tab === 'A'" [attr.data-probe]="tab">
                {{ tab }}
              </button>
            }
          </div>
          <div *uiTabsPanel="'A'" data-probe-panel data-probe="A-panel">A content</div>
          <div *uiTabsPanel="'B'" data-probe-panel data-probe="B-panel">B content</div>
          <div *uiTabsPanel="'C'" data-probe-panel data-probe="C-panel">C content</div>
        }
        @case ("d") {
          <div *uiTabsPanel="'A'" data-probe-panel data-probe="A-panel">A content</div>
          <div *uiTabsPanel="'B'" data-probe-panel data-probe="B-panel">B content</div>
          <div *uiTabsPanel="'C'" data-probe-panel data-probe="C-panel">C content</div>
          <div uiTabsList aria-label="Layout">
            <button uiTabsTab value="A" [disabled]="true" data-probe="A">A</button>
            <button uiTabsTab value="B" data-probe="B">B</button>
            <button uiTabsTab value="C" data-probe="C">C</button>
          </div>
        }
        @case ("h") {
          <div uiTabsList aria-label="Layout">
            @if (showA) {
              <button uiTabsTab value="A" data-probe="A">A</button>
            }
            <button uiTabsTab value="B" data-probe="B">B</button>
            <button uiTabsTab value="C" data-probe="C">C</button>
          </div>
          <div *uiTabsPanel="'A'" data-probe-panel data-probe="A-panel">A content</div>
          <div *uiTabsPanel="'B'" data-probe-panel data-probe="B-panel">B content</div>
          <div *uiTabsPanel="'C'" data-probe-panel data-probe="C-panel">C content</div>
        }
        @case ("g") {
          <div uiTabsList aria-label="Layout">
            <button uiTabsTab value="A" [disabled]="true" data-probe="A">A</button>
            <button uiTabsTab value="B" [disabled]="true" data-probe="B">B</button>
            <button uiTabsTab value="C" [disabled]="true" data-probe="C">C</button>
          </div>
          <div *uiTabsPanel="'A'" data-probe-panel data-probe="A-panel">A content</div>
          <div *uiTabsPanel="'B'" data-probe-panel data-probe="B-panel">B content</div>
          <div *uiTabsPanel="'C'" data-probe-panel data-probe="C-panel">C content</div>
        }
        @default {
          <div uiTabsList aria-label="Layout">
            <button uiTabsTab value="A" [disabled]="true" data-probe="A">A</button>
            <button uiTabsTab value="B" data-probe="B">B</button>
            <button uiTabsTab value="C" data-probe="C">C</button>
          </div>
          <div *uiTabsPanel="'A'" data-probe-panel data-probe="A-panel">A content</div>
          <div *uiTabsPanel="'B'" data-probe-panel data-probe="B-panel">B content</div>
          <div *uiTabsPanel="'C'" data-probe-panel data-probe="C-panel">C content</div>
        }
      }
    </div>
    <output data-testid="layout-state">{{ root.state().value ?? "null" }}</output>
  `,
})
export class TabsLayouts {
  readonly layout = input.required<string>();
  readonly defaultValue = input<string | undefined>(undefined);
  readonly value = input<string | null | undefined>(undefined);
  protected readonly wakes = signal(0);
  protected readonly tabs = ["A", "B", "C"];
  protected readonly showA = true;

  protected log(name: string, value: unknown): void {
    report({ name, label: "layout", value });
  }
}

/**
 * `/tabs` renders the cases; `/tabs?layout=<a…h>` one layout, `-default` adding `defaultValue`
 * C. Both sit inside a `@defer (hydrate on interaction)` block in incremental mode.
 */
@Component({
  selector: "app-tabs-route",
  imports: [TabsCases, TabsLayouts],
  template: `
    @if (layout === null) {
      @if (deferred) {
        @defer (hydrate on interaction) {
          <app-tabs-cases />
        }
      } @else {
        <app-tabs-cases />
      }
    } @else {
      @if (deferred) {
        @defer (hydrate on interaction) {
          <app-tabs-layouts [layout]="layout" [defaultValue]="defaultValue" [value]="value" />
        }
      } @else {
        <app-tabs-layouts [layout]="layout" [defaultValue]="defaultValue" [value]="value" />
      }
    }
    <span data-testid="app-ready" [attr.data-ready]="ready()">tabs</span>
  `,
})
export class TabsRoute {
  protected readonly deferred = incremental;
  protected readonly ready = renderedFlag();
  readonly #query = inject(ActivatedRoute).snapshot.queryParamMap;
  readonly #layout = this.#query.get("layout");
  protected readonly layout = layoutOf(this.#layout);
  protected readonly defaultValue = defaultOf(this.#layout);
  protected readonly value = valueOf(this.#layout);
}

function layoutOf(layout: string | null): string | null {
  if (layout === null) {
    return null;
  }

  return layout.replace(/-default$/, "");
}

/** (c′) and (d′) default to C. */
function defaultOf(layout: string | null): string | undefined {
  if (layout?.endsWith("-default")) {
    return "C";
  }

  return undefined;
}

/** (e) controls with `null`, (f) with A; the others leave `value` unset. */
function valueOf(layout: string | null): string | null | undefined {
  if (layout === "e") {
    return null;
  }

  if (layout === "f") {
    return "A";
  }

  return undefined;
}

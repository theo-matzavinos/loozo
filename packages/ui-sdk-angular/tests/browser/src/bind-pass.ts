import { isPlatformBrowser } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  HostAttributeToken,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  inject,
} from "@angular/core";
import { UiTabs, UiTabsList, UiTabsTab } from "@loozo/ui-sdk-angular/tabs";
import { UiToolbar, UiToolbarButton } from "@loozo/ui-sdk-angular/toolbar";
import { incremental } from "./mode";
import { report } from "./panels";
import { renderedFlag } from "./ready";

/**
 * Fixture-only: an input dispatched from the first render's write phase, between the slots that
 * registered their bind before this element and those after it. `key` focuses the next element
 * and dispatches a bubbling ArrowRight keydown on it; `click` clicks the previous element. With
 * `?order=1`, `key` also dispatches an End keydown from a microtask after the creation pass, the
 * queue's earlier event. Its render callback registers on the node injector, in template order.
 */
@Directive({ selector: "[appBindPass]" })
export class AppBindPass {
  constructor() {
    const mode = inject(new HostAttributeToken("appBindPass"));

    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    const marker = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const keyTarget = () => marker.nextElementSibling as HTMLElement;
    const key = (name: string) => {
      keyTarget().dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
      );
    };

    afterNextRender(
      {
        write: () => {
          report({ name: "bind-pass-start", label: mode });

          if (mode === "key") {
            keyTarget().focus();
            key("ArrowRight");
          } else {
            (marker.previousElementSibling as HTMLElement).click();
          }

          report({ name: "bind-pass-end", label: mode });
        },
      },
      { injector: inject(Injector) },
    );

    if (new URLSearchParams(location.search).get("order") === "1") {
      queueMicrotask(() => {
        if (mode !== "key") {
          return;
        }

        report({ name: "early-key", label: "End" });
        key("End");
      });
    }
  }
}

/** A Toolbar in a creation template, so its slots and the probes register in template order. */
@Component({
  selector: "app-bind-pass-toolbar",
  imports: [AppBindPass, UiToolbar, UiToolbarButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" data-testid="hydrate">Hydrate</button>
    <div uiToolbar data-probe="toolbar" aria-label="Bind pass">
      <span appBindPass="key"></span>
      <button uiToolbarButton data-probe="b1" (press)="pressed('b1')">B1</button>
      <span appBindPass="click"></span>
      <button uiToolbarButton data-probe="b2" (press)="pressed('b2')">B2</button>
      <button uiToolbarButton data-probe="b3" (press)="pressed('b3')">B3</button>
      <button uiToolbarButton data-probe="b4" (press)="pressed('b4')">B4</button>
    </div>
    @if (!deferred) {
      <span data-testid="app-ready" [attr.data-ready]="ready()">bind pass</span>
    }
  `,
})
export class BindPassToolbar {
  protected readonly deferred = incremental;
  protected readonly ready = renderedFlag();

  protected pressed(label: string): void {
    report({ name: "press", label });
  }
}

/** Tabs in a creation template: the list binds, then the probe runs, then the tabs bind. */
@Component({
  selector: "app-bind-pass-tabs",
  imports: [AppBindPass, UiTabs, UiTabsList, UiTabsTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" data-testid="hydrate">Hydrate</button>
    <div uiTabs data-probe="tabs" defaultValue="t1" (valueChange)="changed($event)">
      <div uiTabsList data-probe="tabs-list" aria-label="Bind pass">
        <span appBindPass="key"></span>
        <button uiTabsTab value="t1" data-probe="t1">T1</button>
        <button uiTabsTab value="t2" data-probe="t2">T2</button>
        <button uiTabsTab value="t3" data-probe="t3">T3</button>
        <button uiTabsTab value="t4" data-probe="t4">T4</button>
      </div>
    </div>
    @if (!deferred) {
      <span data-testid="app-ready" [attr.data-ready]="ready()">bind pass</span>
    }
  `,
})
export class BindPassTabs {
  protected readonly deferred = incremental;
  protected readonly ready = renderedFlag();

  protected changed(value: string | null): void {
    report({ name: "valueChange", label: "tabs", value });
  }
}

/** The incremental route: the probe component directly inside a `@defer` block. */
@Component({
  selector: "app-bind-pass-toolbar-defer",
  imports: [BindPassToolbar],
  template: `
    @defer (hydrate on interaction) {
      <app-bind-pass-toolbar />
    }
    <span data-testid="app-ready" [attr.data-ready]="ready()">bind pass</span>
  `,
})
export class BindPassToolbarDefer {
  protected readonly ready = renderedFlag();
}

/** The incremental route: the probe component directly inside a `@defer` block. */
@Component({
  selector: "app-bind-pass-tabs-defer",
  imports: [BindPassTabs],
  template: `
    @defer (hydrate on interaction) {
      <app-bind-pass-tabs />
    }
    <span data-testid="app-ready" [attr.data-ready]="ready()">bind pass</span>
  `,
})
export class BindPassTabsDefer {
  protected readonly ready = renderedFlag();
}

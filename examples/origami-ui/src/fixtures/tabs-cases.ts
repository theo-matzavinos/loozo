import { ChangeDetectorRef, Component, Directive, inject, signal } from "@angular/core";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsTrigger,
  OrigamiTabsPanel,
  OrigamiTabsState,
} from "@loozo/origami-ui/tabs";

// S3 manual vertical, S4 reading direction, the S5 navigation targets whose own focus handler
// removes, disables or redirects them, and the S6 nested owner, beside the core seed's automatic
// horizontal Tabs. Each case is identified by `data-tabs-case`.

@Directive({ selector: "[tabsProbe]", exportAs: "tabsProbe" })
export class TabsProbe {
  readonly state = inject(OrigamiTabsState);
}

@Component({
  selector: "acceptance-tabs-cases",
  imports: [OrigamiTabs, OrigamiTabsList, OrigamiTabsTrigger, OrigamiTabsPanel, TabsProbe],
  template: `
    <h2>Manual vertical Tabs</h2>
    <section
      ogTabs
      [(value)]="manual"
      orientation="vertical"
      activation="manual"
      (valueChange)="manualOutputs.update(increment)"
      data-tabs-case="manual"
    >
      <div ogTabsList aria-label="Settings" data-role="list">
        <button ogTabsTrigger value="profile" data-role="profile">Profile</button>
        <button ogTabsTrigger value="billing" disabled data-role="billing">Billing</button>
        <button ogTabsTrigger value="security" data-role="security">Security</button>
      </div>
      <div ogTabsPanel value="profile" data-role="panel-profile">Profile settings</div>
      <div ogTabsPanel value="billing" data-role="panel-billing">Billing settings</div>
      <div ogTabsPanel value="security" data-role="panel-security">Security settings</div>
      <output data-role="value">{{ manual() }}</output>
      <output data-role="outputs">{{ manualOutputs() }}</output>
    </section>
    <button type="button" data-testid="manual-tabs-after">After manual Tabs</button>

    <h2>Right-to-left Tabs</h2>
    <div dir="rtl">
      <section ogTabs [(value)]="rtl" data-tabs-case="rtl">
        <div ogTabsList aria-label="Right-to-left" data-role="list">
          <button ogTabsTrigger value="first" data-role="first">First</button>
          <button ogTabsTrigger value="second" data-role="second">Second</button>
          <button ogTabsTrigger value="third" data-role="third">Third</button>
        </div>
        <output data-role="value">{{ rtl() }}</output>
      </section>
      <section ogTabs [(value)]="rtlVertical" orientation="vertical" data-tabs-case="rtl-vertical">
        <div ogTabsList aria-label="Right-to-left vertical" data-role="list">
          <button ogTabsTrigger value="first" data-role="first">First</button>
          <button ogTabsTrigger value="second" data-role="second">Second</button>
        </div>
        <output data-role="value">{{ rtlVertical() }}</output>
      </section>
    </div>

    <h2>Navigation targets that change during focus</h2>
    <!-- Each target's focus handler runs inside the focus() call of an arrow key or a click's
      activation; detectChanges applies the removal or disabling before that call returns. -->
    <section
      ogTabs
      [(value)]="vanish"
      (valueChange)="guardOutputs.update(increment)"
      data-tabs-case="focus-vanish"
    >
      <div ogTabsList aria-label="Removed during focus" data-role="list">
        <button ogTabsTrigger value="start" data-role="start">Start</button>
        @if (vanishMounted()) {
          <button
            ogTabsTrigger
            value="target"
            data-role="target"
            (focus)="vanishMounted.set(false); changeDetector.detectChanges()"
          >
            Removed on focus
          </button>
        }
      </div>
      <output data-role="value">{{ vanish() }}</output>
    </section>
    <section
      ogTabs
      [(value)]="disable"
      (valueChange)="guardOutputs.update(increment)"
      data-tabs-case="focus-disable"
    >
      <div ogTabsList aria-label="Disabled during focus" data-role="list">
        <button ogTabsTrigger value="start" data-role="start">Start</button>
        <button
          ogTabsTrigger
          value="target"
          [disabled]="targetDisabled()"
          data-role="target"
          (focus)="targetDisabled.set(true); changeDetector.detectChanges()"
        >
          Disabled on focus
        </button>
      </div>
      <output data-role="value">{{ disable() }}</output>
    </section>
    <section
      ogTabs
      [(value)]="redirect"
      (valueChange)="guardOutputs.update(increment)"
      data-tabs-case="focus-redirect"
    >
      <div ogTabsList aria-label="Redirected during focus" data-role="list">
        <button ogTabsTrigger value="start" data-role="start">Start</button>
        <button ogTabsTrigger value="target" data-role="target" (focus)="redirectTarget.focus()">
          Redirected on focus
        </button>
      </div>
      <output data-role="value">{{ redirect() }}</output>
    </section>
    <button type="button" #redirectTarget data-testid="focus-redirect-target">
      Redirect target
    </button>
    <output data-testid="focus-guard-outputs">{{ guardOutputs() }}</output>
    <button
      type="button"
      data-testid="restore-focus-targets"
      (click)="vanishMounted.set(true); targetDisabled.set(false)"
    >
      Restore focus targets
    </button>

    <h2>Nested Tabs</h2>
    <section ogTabs #outerTabs="ogTabs" [(value)]="outer" data-tabs-case="nested">
      <div ogTabsList aria-label="Outer" data-role="outer-list">
        <button ogTabsTrigger value="a" data-role="outer-a">Outer A</button>
        <button ogTabsTrigger value="b" data-role="outer-b">Outer B</button>
      </div>
      <div ogTabsPanel value="a" data-role="outer-panel-a">
        <section ogTabs #innerTabs="ogTabs" [(value)]="inner">
          <div ogTabsList aria-label="Inner" data-role="inner-list">
            <button ogTabsTrigger value="x" data-role="inner-x">Inner X</button>
            <button ogTabsTrigger value="y" data-role="inner-y">Inner Y</button>
          </div>
          <div ogTabsPanel value="x" tabsProbe #innerProbe="tabsProbe" data-role="inner-panel-x">
            Inner X content
          </div>
          <output data-role="inner-shared">{{ innerTabs.state === innerProbe.state }}</output>
          <output data-role="independent">{{ innerTabs.state !== outerTabs.state }}</output>
        </section>
      </div>
      <div ogTabsPanel value="b" data-role="outer-panel-b">Outer B content</div>
      <output data-role="outer-value">{{ outer() }}</output>
      <output data-role="inner-value">{{ inner() }}</output>
    </section>
  `,
})
export class TabsCases {
  readonly manual = signal<string | null>("profile");
  readonly manualOutputs = signal(0);
  readonly rtl = signal<string | null>("first");
  readonly rtlVertical = signal<string | null>("first");
  readonly vanish = signal<string | null>("start");
  readonly vanishMounted = signal(true);
  readonly disable = signal<string | null>("start");
  readonly targetDisabled = signal(false);
  readonly redirect = signal<string | null>("start");
  readonly guardOutputs = signal(0);
  readonly outer = signal<string | null>("a");
  readonly inner = signal<string | null>("x");
  readonly increment = (value: number): number => value + 1;
  readonly changeDetector = inject(ChangeDetectorRef);
}

import { Component, inject, signal } from "@angular/core";
import {
  FormField,
  disabled,
  form,
  minLength,
  readonly,
  required,
  submit,
} from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldControl,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import {
  OrigamiToggleGroupItem,
  OrigamiToggleGroupMultiple,
  OrigamiToggleGroupSingle,
} from "@loozo/origami-ui/toggle-group";
import { OrigamiToolbar, OrigamiToolbarRadioGroup } from "@loozo/origami-ui/toolbar";

/**
 * The falsifier: a consumer component that is the Radio Group through `hostDirectives`, exposing
 * the model, `disabled` and `touch`, so `[formField]` on it finds the Radio Group's model. Signal
 * Forms calls `focus()` on the control it found, this component, so it forwards to the group.
 */
@Component({
  selector: "[planPicker]",
  hostDirectives: [
    {
      directive: OrigamiRadioGroup,
      inputs: ["value", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  imports: [OrigamiRadioGroupItem],
  template: `
    <button ogRadioGroupItem value="monthly" data-testid="plan-monthly">Monthly</button>
    <button ogRadioGroupItem value="yearly" data-testid="plan-yearly">Yearly</button>
  `,
})
export class PlanPicker {
  readonly #group = inject(OrigamiRadioGroup);

  focus(options?: FocusOptions): void {
    this.#group.focus(options);
  }
}

/** The falsifier for a ToggleGroup root: Multiple through `hostDirectives`, without a `focus()`. */
@Component({
  selector: "[topicPicker]",
  hostDirectives: [
    {
      directive: OrigamiToggleGroupMultiple,
      inputs: ["value", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  imports: [OrigamiToggleGroupItem],
  template: `
    <button ogToggleGroupItem value="news" data-testid="topic-news">News</button>
    <button ogToggleGroupItem value="sports" data-testid="topic-sports">Sports</button>
  `,
})
export class TopicPicker {}

@Component({
  selector: "acceptance-group-field-fixture",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldControl,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiRadioGroup,
    OrigamiRadioGroupItem,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupMultiple,
    OrigamiToggleGroupItem,
    OrigamiToolbar,
    OrigamiToolbarRadioGroup,
    PlanPicker,
    TopicPicker,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach group field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="before">Before the groups</button>

    <section>
      <h2 id="standalone-heading">Standalone size</h2>
      <div
        ogRadioGroup
        data-testid="standalone-radio"
        aria-labelledby="standalone-heading"
        aria-describedby="standalone-hint"
        [(value)]="size"
        (touch)="standaloneTouches.update(increment)"
      >
        <button ogRadioGroupItem value="s" data-testid="size-s">S</button>
        <button ogRadioGroupItem value="m" data-testid="size-m">M</button>
      </div>
      <p id="standalone-hint">Sizes run small.</p>
      <output data-testid="standalone-touches">{{ standaloneTouches() }}</output>
      <div
        ogToggleGroupSingle
        data-testid="standalone-toggle-group"
        aria-labelledby="standalone-heading"
        aria-describedby="standalone-hint"
      >
        <button ogToggleGroupItem value="left">Left</button>
      </div>
    </section>

    <section>
      <h2>Field associations</h2>
      <div ogField data-testid="delivery-field">
        <span ogFieldLabel id="delivery-label" data-testid="delivery-label">Delivery</span>
        <div
          ogRadioGroup
          data-testid="delivery"
          aria-labelledby="delivery-static"
          aria-describedby="delivery-static"
          [(value)]="delivery"
        >
          <button ogRadioGroupItem value="pickup" data-testid="delivery-pickup">Pickup</button>
          <button ogRadioGroupItem value="courier" data-testid="delivery-courier">Courier</button>
        </div>
        <p ogFieldDescription id="delivery-description">Pickup is free.</p>
        @if (duplicateGroup()) {
          <div
            ogRadioGroup
            data-testid="duplicate-group"
            aria-labelledby="delivery-static"
            aria-describedby="delivery-static"
          >
            <button ogRadioGroupItem value="other">Other</button>
          </div>
        }
        @if (secondLabel()) {
          <span ogFieldLabel id="delivery-label-2" data-testid="delivery-label-2">
            (choose one)
          </span>
        }
      </div>
      <p id="delivery-static">Static delivery text.</p>
      <button type="button" data-testid="toggle-second-label" (click)="secondLabel.update(flip)">
        Toggle the second label
      </button>
      <button type="button" data-testid="mount-duplicate-group" (click)="duplicateGroup.set(true)">
        Mount a second group
      </button>

      <div ogField data-testid="nickname-field">
        <label ogFieldLabel data-testid="nickname-label">Nickname</label>
        <input ogFieldControl id="nickname" data-testid="nickname" />
        <span ogFieldLabel data-testid="nickname-hint-label">(optional)</span>
      </div>

      <div ogField data-testid="align-field">
        <div ogToggleGroupSingle data-testid="align" [(value)]="alignment">
          <button ogToggleGroupItem value="start" data-testid="align-start">Start</button>
          <button ogToggleGroupItem value="end" data-testid="align-end">End</button>
        </div>
        <span ogFieldLabel id="align-label">Alignment</span>
        <p ogFieldDescription id="align-description">Applies to the title.</p>
      </div>

      <div ogField data-testid="unlabelled-field">
        <div ogRadioGroup data-testid="unlabelled" aria-labelledby="standalone-heading">
          <button ogRadioGroupItem value="one">One</button>
        </div>
      </div>
    </section>

    <section>
      <h2>Signal Forms</h2>
      <div ogField #speedField="ogField" data-testid="speed-field">
        <span ogFieldLabel id="speed-label">Shipping speed</span>
        <div ogRadioGroup data-testid="speed" [formField]="order.speed">
          <button ogRadioGroupItem value="standard" data-testid="speed-standard">Standard</button>
          <button ogRadioGroupItem value="express" data-testid="speed-express">Express</button>
          <button ogRadioGroupItem value="same-day" data-testid="speed-same-day">Same day</button>
        </div>
        <p ogFieldDescription id="speed-description">Express ships today.</p>
        @if (speedField.state.errorsShown()) {
          <p ogFieldError id="speed-error">{{ speedField.state.errors()[0]?.message }}</p>
        }
      </div>
      <output data-testid="speed-value">{{ model().speed }}</output>
      <output data-testid="speed-touched">{{ order.speed().touched() }}</output>
      <button type="button" data-testid="write-speed" (click)="writeSpeed()">
        Write the speed model
      </button>
      <button type="button" data-testid="clear-speed" (click)="clearSpeed()">
        Clear the speed model
      </button>
      <button type="button" data-testid="focus-speed" (click)="order.speed().focusBoundControl()">
        Focus the speed control
      </button>
      <button type="button" data-testid="reset-speed" (click)="order.speed().reset()">
        Reset the speed field
      </button>
      <button type="button" data-testid="freeze-speed" (click)="speedFrozen.update(flip)">
        Freeze speed
      </button>
      <button type="button" data-testid="lock-speed" (click)="speedLocked.update(flip)">
        Lock speed
      </button>

      <div ogField #layoutField="ogField" data-testid="layout-field">
        <span ogFieldLabel>Layout</span>
        <div ogToggleGroupSingle data-testid="layout" [formField]="order.layout">
          <button ogToggleGroupItem value="grid" data-testid="layout-grid">Grid</button>
          <button ogToggleGroupItem value="list" data-testid="layout-list">List</button>
        </div>
        @if (layoutField.state.errorsShown()) {
          <p ogFieldError id="layout-error">{{ layoutField.state.errors()[0]?.message }}</p>
        }
      </div>
      <output data-testid="layout-value">{{ model().layout }}</output>
      <output data-testid="layout-touched">{{ order.layout().touched() }}</output>
      <button type="button" data-testid="write-layout" (click)="writeLayout()">
        Write the layout model
      </button>
      <button type="button" data-testid="focus-layout" (click)="order.layout().focusBoundControl()">
        Focus the layout control
      </button>
      <button type="button" data-testid="reset-layout" (click)="order.layout().reset()">
        Reset the layout field
      </button>
      <button type="button" data-testid="freeze-layout" (click)="layoutFrozen.update(flip)">
        Freeze layout
      </button>
      <button type="button" data-testid="lock-layout" (click)="layoutLocked.update(flip)">
        Lock layout
      </button>

      <div ogField #extrasField="ogField" data-testid="extras-field">
        <span ogFieldLabel>Extras</span>
        <div ogToggleGroupMultiple data-testid="extras" [formField]="order.extras">
          <button ogToggleGroupItem value="wrap" data-testid="extras-wrap">Gift wrap</button>
          <button ogToggleGroupItem value="note" data-testid="extras-note">Note</button>
        </div>
        <p ogFieldDescription id="extras-description">Pick at least one.</p>
        @if (extrasField.state.errorsShown()) {
          <p ogFieldError id="extras-error">{{ extrasField.state.errors()[0]?.message }}</p>
        }
      </div>
      <output data-testid="extras-value">{{ model().extras.join(",") }}</output>
      <output data-testid="extras-touched">{{ order.extras().touched() }}</output>
      <button type="button" data-testid="write-extras" (click)="writeExtras()">
        Write the extras model
      </button>
      <button type="button" data-testid="focus-extras" (click)="order.extras().focusBoundControl()">
        Focus the extras control
      </button>
      <button type="button" data-testid="reset-extras" (click)="order.extras().reset()">
        Reset the extras field
      </button>
      <button type="button" data-testid="freeze-extras" (click)="extrasFrozen.update(flip)">
        Freeze extras
      </button>
      <button type="button" data-testid="lock-extras" (click)="extrasLocked.update(flip)">
        Lock extras
      </button>
      <button type="button" data-testid="submit-order" (click)="submitOrder()">Submit</button>
      <output data-testid="submits">{{ submits() }}</output>
    </section>

    <section>
      <h2>Composed through hostDirectives</h2>
      <div ogField #planField="ogField" data-testid="plan-field">
        <span ogFieldLabel id="plan-label">Billing plan</span>
        <div planPicker data-testid="plan" [formField]="order.plan"></div>
        @if (planField.state.errorsShown()) {
          <p ogFieldError id="plan-error">Choose a plan.</p>
        }
      </div>
      <output data-testid="plan-value">{{ model().plan }}</output>
      <output data-testid="plan-touched">{{ order.plan().touched() }}</output>
      <button type="button" data-testid="write-plan" (click)="writePlan()">
        Write the plan model
      </button>
      <button type="button" data-testid="focus-plan" (click)="order.plan().focusBoundControl()">
        Focus the plan control
      </button>
      <button type="button" data-testid="freeze-plan" (click)="planFrozen.update(flip)">
        Freeze the plan field
      </button>
      <button type="button" data-testid="lock-plan" (click)="planLocked.update(flip)">
        Lock the plan field
      </button>

      <div ogField data-testid="topics-field">
        <span ogFieldLabel id="topics-label">Topics</span>
        <div topicPicker data-testid="topics" [formField]="order.topics"></div>
      </div>
      <output data-testid="topics-value">{{ model().topics.join(",") }}</output>
      <output data-testid="topics-touched">{{ order.topics().touched() }}</output>
      <button type="button" data-testid="freeze-topics" (click)="topicsFrozen.update(flip)">
        Freeze the topics field
      </button>
      <button type="button" data-testid="lock-topics" (click)="topicsLocked.update(flip)">
        Lock the topics field
      </button>
    </section>

    <section>
      <h2>Toolbar Radio Group inside a Field</h2>
      <div ogField data-testid="toolbar-field">
        <span ogFieldLabel data-testid="toolbar-label">Text alignment</span>
        <div ogToolbar aria-label="Formatting">
          <div
            ogToolbarRadioGroup
            data-testid="toolbar-radio"
            aria-labelledby="toolbar-static"
            [(value)]="toolbarAlignment"
          >
            <button ogRadioGroupItem value="left" data-testid="toolbar-left">Left</button>
            <button ogRadioGroupItem value="right">Right</button>
          </div>
        </div>
        <p ogFieldDescription>Applies to the paragraph.</p>
      </div>
      <p id="toolbar-static">Toolbar alignment</p>
    </section>
    <button type="button" data-testid="after">After the groups</button>
  `,
})
export class GroupFieldFixture {
  readonly attached = signal(false);
  readonly size = signal<string | null>(null);
  readonly standaloneTouches = signal(0);
  readonly delivery = signal<string | null>(null);
  readonly secondLabel = signal(true);
  readonly duplicateGroup = signal(false);
  readonly alignment = signal<string | null>(null);
  readonly toolbarAlignment = signal<string | null>(null);
  readonly speedFrozen = signal(false);
  readonly speedLocked = signal(false);
  readonly layoutFrozen = signal(false);
  readonly layoutLocked = signal(false);
  readonly extrasFrozen = signal(false);
  readonly extrasLocked = signal(false);
  readonly planFrozen = signal(false);
  readonly planLocked = signal(false);
  readonly topicsFrozen = signal(false);
  readonly topicsLocked = signal(false);
  readonly submits = signal(0);
  readonly model = signal<{
    speed: string | null;
    layout: string | null;
    extras: string[];
    plan: string | null;
    topics: string[];
  }>({ speed: null, layout: "grid", extras: [], plan: null, topics: [] });
  readonly order = form(this.model, (path) => {
    required(path.speed, { message: "Choose a shipping speed." });
    readonly(path.speed, () => this.speedFrozen());
    disabled(path.speed, () => this.speedLocked());
    required(path.layout, { message: "Choose a layout." });
    readonly(path.layout, () => this.layoutFrozen());
    disabled(path.layout, () => this.layoutLocked());
    minLength(path.extras, 1, { message: "Pick at least one extra." });
    readonly(path.extras, () => this.extrasFrozen());
    disabled(path.extras, () => this.extrasLocked());
    required(path.plan);
    readonly(path.plan, () => this.planFrozen());
    disabled(path.plan, () => this.planLocked());
    readonly(path.topics, () => this.topicsFrozen());
    disabled(path.topics, () => this.topicsLocked());
  });

  flip(value: boolean): boolean {
    return !value;
  }

  increment(value: number): number {
    return value + 1;
  }

  writeSpeed(): void {
    this.model.update((model) => ({ ...model, speed: "same-day" }));
  }

  clearSpeed(): void {
    this.model.update((model) => ({ ...model, speed: null }));
  }

  writeLayout(): void {
    this.model.update((model) => ({ ...model, layout: null }));
  }

  writeExtras(): void {
    this.model.update((model) => ({ ...model, extras: ["wrap"] }));
  }

  writePlan(): void {
    this.model.update((model) => ({ ...model, plan: "monthly" }));
  }

  async submitOrder(): Promise<void> {
    await submit(this.order, async () => {
      this.submits.update((count) => count + 1);
    });
  }
}

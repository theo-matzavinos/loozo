import { Component, inject, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

// Select case Z9: Field and Signal Forms. Controls the tests use as script actions are buttons.

function increment(value: number): number {
  return value + 1;
}

function flip(value: boolean): boolean {
  return !value;
}

const listStyles = `
  .list { color: inherit; background: #222222; border: 1px solid #555555; padding: 4px;
    min-inline-size: var(--og-anchor-width); }
  .panel { color: inherit; background: #333333; border: 1px solid #777777; padding: 8px; }
  [ogSelectOption] { padding: 2px 8px; }
  [ogSelectOption][data-active] { background: #444466; }
`;

/**
 * A consumer component that is the Select through `hostDirectives`, exposing the model,
 * `disabled` and `touch`, so `[formField]` on it finds the Select's model. Signal Forms calls
 * `focus()` on the control it found, this component, so it forwards to the Select.
 */
@Component({
  selector: "[statusPicker]",
  hostDirectives: [
    {
      directive: OrigamiSelect,
      inputs: ["value", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  imports: [OrigamiSelectTrigger, OrigamiSelectContent, OrigamiSelectOption],
  template: `
    <button ogSelectTrigger data-testid="status-trigger">
      {{ select.state.selectedOption()?.label ?? "Choose a status" }}
    </button>
    <div ogSelectContent data-testid="status-content" class="list">
      <div ogSelectOption value="open" label="Open" data-testid="status-open">Open</div>
      <div ogSelectOption value="closed" label="Closed" data-testid="status-closed">Closed</div>
    </div>
  `,
  styles: listStyles,
})
export class StatusPicker {
  readonly select = inject<OrigamiSelect<string>>(OrigamiSelect);

  focus(options?: FocusOptions): void {
    this.select.focus(options);
  }
}

@Component({
  selector: "select-field-cases",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiSelect,
    OrigamiSelectTrigger,
    OrigamiSelectContent,
    OrigamiSelectOption,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    StatusPicker,
  ],
  template: `
    <section>
      <h2>Signal Forms</h2>
      <button type="button" data-testid="priority-before">Before the priority</button>
      <div ogField #priorityField="ogField" data-testid="priority-field">
        <span ogFieldLabel id="priority-label" data-testid="priority-label">Priority</span>
        <div ogSelect #priority="ogSelect" [formField]="todo.priority">
          <button ogSelectTrigger data-testid="priority-trigger">
            {{ priority.state.selectedOption()?.label ?? "Choose" }}
          </button>
          <div ogSelectContent data-testid="priority-content" class="list">
            <div ogSelectOption [value]="1" label="Low" data-testid="priority-1">Low</div>
            <div ogSelectOption [value]="2" label="Medium" data-testid="priority-2">Medium</div>
            <div ogSelectOption [value]="3" label="High" data-testid="priority-3">High</div>
          </div>
        </div>
        <span ogFieldLabel id="priority-label-2" data-testid="priority-label-2">(1 to 3)</span>
        <p ogFieldDescription id="priority-description">How urgent is it?</p>
        @if (priorityField.state.errorsShown()) {
          <p ogFieldError id="priority-error">{{ priorityField.state.errors()[0]?.message }}</p>
        }
      </div>
      <button type="button" data-testid="priority-after">After the priority</button>
      <output data-testid="priority-value">{{ describe(model().priority) }}</output>
      <output data-testid="priority-touched">{{ todo.priority().touched() }}</output>
      <button type="button" data-testid="write-priority" (click)="writePriority()">
        Write High
      </button>
      <button type="button" data-testid="clear-priority" (click)="clearPriority()">
        Clear the priority
      </button>
      <button
        type="button"
        data-testid="focus-priority"
        (click)="todo.priority().focusBoundControl()"
      >
        Focus the priority control
      </button>
      <button type="button" data-testid="reset-priority" (click)="todo.priority().reset()">
        Reset the priority field
      </button>
      <button type="button" data-testid="freeze-priority" (click)="priorityFrozen.update(flip)">
        Freeze the priority
      </button>
      <button type="button" data-testid="lock-priority" (click)="priorityLocked.update(flip)">
        Lock the priority
      </button>
      <button type="button" data-testid="submit-todo" (click)="submitTodo()">Submit</button>
      <output data-testid="todo-submits">{{ submits() }}</output>
    </section>

    <section>
      <h2>Field associations</h2>
      <div ogField data-testid="sort-field">
        <span ogFieldLabel id="sort-label" data-testid="sort-label">Sort order</span>
        <div ogTooltip [openDelay]="0">
          <div ogSelect [(value)]="sortValue">
            <button
              ogSelectTrigger
              ogTooltipTrigger
              data-testid="sort-trigger"
              aria-labelledby="sort-static"
              aria-describedby="sort-static"
            >
              {{ sortValue() }}
            </button>
            <div ogSelectContent data-testid="sort-content" class="list">
              <div ogSelectOption value="newest" data-testid="sort-field-newest">Newest</div>
              <div ogSelectOption value="oldest" data-testid="sort-field-oldest">Oldest</div>
            </div>
          </div>
          <div ogTooltipContent id="sort-tip" class="panel">Applies to the list</div>
        </div>
        <p ogFieldDescription id="sort-description">Newest first by default.</p>
      </div>
      <p id="sort-static">Static sort text.</p>

      <h3 id="standalone-heading">Standalone colour</h3>
      <div
        ogSelect
        [(value)]="colourValue"
        (touch)="colourTouches.update(increment)"
        (valueChange)="colourOutputs.update(increment)"
      >
        <button
          ogSelectTrigger
          data-testid="colour-trigger"
          aria-labelledby="standalone-heading"
          aria-describedby="standalone-hint"
        >
          {{ colourValue() ?? "Choose" }}
        </button>
        <div ogSelectContent data-testid="colour-content" class="list">
          <div ogSelectOption value="red" data-testid="colour-red">Red</div>
          <div ogSelectOption value="blue" data-testid="colour-blue">Blue</div>
        </div>
      </div>
      <p id="standalone-hint">Colours may vary.</p>
      <button type="button" data-testid="colour-after">After the colour</button>
      <output data-testid="colour-touches">{{ colourTouches() }}</output>
      <output data-testid="colour-outputs">{{ colourOutputs() }}</output>

      <h3 id="flavour-heading">Flavours</h3>
      <div ogSelect [(value)]="flavourValue">
        <button ogSelectTrigger data-testid="flavour-trigger" aria-label="Flavour">
          {{ flavourValue() ?? "Choose" }}
        </button>
        <div
          ogSelectContent
          data-testid="flavour-content"
          class="list"
          aria-labelledby="flavour-heading"
        >
          <div ogSelectOption value="mint" data-testid="flavour-mint">Mint</div>
          <div ogSelectOption value="lemon" data-testid="flavour-lemon">Lemon</div>
        </div>
      </div>
    </section>

    <section>
      <h2>Composed through hostDirectives</h2>
      <div ogField #statusField="ogField" data-testid="status-field">
        <span ogFieldLabel id="status-label">Status</span>
        <div statusPicker data-testid="status" [formField]="todo.status"></div>
        @if (statusField.state.errorsShown()) {
          <p ogFieldError id="status-error">Choose a status.</p>
        }
      </div>
      <button type="button" data-testid="status-after">After the status</button>
      <output data-testid="status-value">{{ describe(model().status) }}</output>
      <output data-testid="status-touched">{{ todo.status().touched() }}</output>
      <button type="button" data-testid="write-status" (click)="writeStatus()">
        Write Closed
      </button>
      <button type="button" data-testid="focus-status" (click)="todo.status().focusBoundControl()">
        Focus the status control
      </button>
      <button type="button" data-testid="freeze-status" (click)="statusFrozen.update(flip)">
        Freeze the status
      </button>
      <button type="button" data-testid="lock-status" (click)="statusLocked.update(flip)">
        Lock the status
      </button>
    </section>
    <section>
      <h2>Trigger lifecycle</h2>
      <div ogField data-testid="size-field">
        <span ogFieldLabel id="size-label">Size</span>
        <div ogSelect [formField]="todo.size">
          @if (sizeTrigger() === "first") {
            <button ogSelectTrigger data-testid="size-first" aria-labelledby="size-first-static">
              {{ model().size ?? "Choose a size" }}
            </button>
          } @else if (sizeTrigger() === "second") {
            <button ogSelectTrigger data-testid="size-second" aria-labelledby="size-second-static">
              {{ model().size ?? "Choose a size" }}
            </button>
          }
          <div ogSelectContent data-testid="size-content" class="list">
            <div ogSelectOption value="small" data-testid="size-small">Small</div>
            <div ogSelectOption value="large" data-testid="size-large">Large</div>
          </div>
        </div>
      </div>
      <p id="size-first-static">Static first size text.</p>
      <p id="size-second-static">Static second size text.</p>
      <output data-testid="size-value">{{ describe(model().size) }}</output>
      <button type="button" data-testid="mount-first-size" (click)="sizeTrigger.set('first')">
        Mount the first size Trigger
      </button>
      <button type="button" data-testid="mount-second-size" (click)="sizeTrigger.set('second')">
        Mount the second size Trigger
      </button>
      <button type="button" data-testid="remove-size" (click)="sizeTrigger.set(null)">
        Remove the size Trigger
      </button>
      <button type="button" data-testid="focus-size" (click)="todo.size().focusBoundControl()">
        Focus the size control
      </button>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    output {
      display: block;
    }
    ${listStyles}
  `,
})
export class SelectFieldCases {
  readonly increment = increment;
  readonly flip = flip;

  readonly priorityFrozen = signal(false);
  readonly priorityLocked = signal(false);
  readonly statusFrozen = signal(false);
  readonly statusLocked = signal(false);
  readonly submits = signal(0);
  readonly sizeTrigger = signal<"first" | "second" | null>(null);
  readonly model = signal<{
    priority: number | null;
    status: string | null;
    size: string | null;
  }>({
    priority: null,
    status: null,
    size: null,
  });
  readonly todo = form(this.model, (path) => {
    required(path.priority, { message: "Choose a priority." });
    readonly(path.priority, () => this.priorityFrozen());
    disabled(path.priority, () => this.priorityLocked());
    required(path.status);
    readonly(path.status, () => this.statusFrozen());
    disabled(path.status, () => this.statusLocked());
  });

  readonly sortValue = signal<string | null>("newest");
  readonly colourValue = signal<string | null>(null);
  readonly colourTouches = signal(0);
  readonly flavourValue = signal<string | null>(null);
  readonly colourOutputs = signal(0);

  writePriority(): void {
    this.model.update((model) => ({ ...model, priority: 3 }));
  }

  clearPriority(): void {
    this.model.update((model) => ({ ...model, priority: null }));
  }

  writeStatus(): void {
    this.model.update((model) => ({ ...model, status: "closed" }));
  }

  /** A value with its runtime type, so `"1"` and `1` read differently. */
  describe(value: string | number | null): string {
    if (value === null) {
      return "null";
    }

    return `${typeof value}:${String(value)}`;
  }

  async submitTodo(): Promise<void> {
    await submit(this.todo, async () => {
      this.submits.update((count) => count + 1);
    });
  }
}

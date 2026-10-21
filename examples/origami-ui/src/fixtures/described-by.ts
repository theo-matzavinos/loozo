import { Component, Directive, input, signal } from "@angular/core";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import {
  OrigamiField,
  OrigamiFieldControl,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { OrigamiSwitch } from "@loozo/origami-ui/switch";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";

/**
 * Every Field control co-applied with a Tooltip Trigger, outside and inside a Field. Two
 * components render it: their `imports` order decides Angular's directive order on each element,
 * and so which describer initializes first.
 */
const coApplied = `
  <button type="button" data-testid="toggle-content" (click)="contentMounted.update(flip)">
    Mount or unmount the Tooltip Content
  </button>
  <button type="button" data-testid="toggle-error" (click)="errorMounted.update(flip)">
    Mount or unmount the Field Errors
  </button>

  <span ogTooltip [openDelay]="0">
    <button
      ogTooltipTrigger
      ogCheckbox
      data-testid="outside-checkbox"
      aria-label="Outside checkbox"
      aria-describedby="static-note"
    ></button>
    @if (contentMounted()) {
      <span ogTooltipContent [id]="order + '-outside-checkbox-tip'">Checkbox tip</span>
    }
  </span>
  <span ogTooltip [openDelay]="0">
    <button
      ogTooltipTrigger
      ogSwitch
      data-testid="outside-switch"
      aria-label="Outside switch"
      aria-describedby="static-note"
    ></button>
    @if (contentMounted()) {
      <span ogTooltipContent [id]="order + '-outside-switch-tip'">Switch tip</span>
    }
  </span>
  <span ogTooltip [openDelay]="0">
    <input
      ogTooltipTrigger
      ogFieldControl
      data-testid="outside-input"
      aria-label="Outside input"
      aria-describedby="static-note"
    />
    @if (contentMounted()) {
      <span ogTooltipContent [id]="order + '-outside-input-tip'">Input tip</span>
    }
  </span>

  <div ogField>
    <span ogTooltip [openDelay]="0">
      <button
        ogTooltipTrigger
        ogCheckbox
        data-testid="field-checkbox"
        aria-describedby="static-note"
      ></button>
      @if (contentMounted()) {
        <span ogTooltipContent [id]="order + '-field-checkbox-tip'">Checkbox tip</span>
      }
    </span>
    <label ogFieldLabel>Field checkbox</label>
    <p ogFieldDescription [id]="order + '-field-checkbox-description'">Checkbox description</p>
    @if (errorMounted()) {
      <p ogFieldError [id]="order + '-field-checkbox-error'">Checkbox error</p>
    }
  </div>
  <div ogField>
    <span ogTooltip [openDelay]="0">
      <button
        ogTooltipTrigger
        ogSwitch
        data-testid="field-switch"
        aria-describedby="static-note"
      ></button>
      @if (contentMounted()) {
        <span ogTooltipContent [id]="order + '-field-switch-tip'">Switch tip</span>
      }
    </span>
    <label ogFieldLabel>Field switch</label>
    <p ogFieldDescription [id]="order + '-field-switch-description'">Switch description</p>
    @if (errorMounted()) {
      <p ogFieldError [id]="order + '-field-switch-error'">Switch error</p>
    }
  </div>
  <div ogField>
    <span ogTooltip [openDelay]="0">
      <input
        ogTooltipTrigger
        ogFieldControl
        data-testid="field-input"
        aria-describedby="static-note"
      />
      @if (contentMounted()) {
        <span ogTooltipContent [id]="order + '-field-input-tip'">Input tip</span>
      }
    </span>
    <label ogFieldLabel>Field input</label>
    <p ogFieldDescription [id]="order + '-field-input-description'">Input description</p>
    @if (errorMounted()) {
      <p ogFieldError [id]="order + '-field-input-error'">Input error</p>
    }
  </div>
`;

/** Toggles shared by both orders. */
@Directive()
abstract class CoApplied {
  abstract readonly order: string;
  readonly contentMounted = signal(true);
  readonly errorMounted = signal(false);

  flip(value: boolean): boolean {
    return !value;
  }
}

/** The Tooltip imported before the Field controls: the Trigger initializes first. */
@Component({
  selector: "acceptance-tooltip-first",
  imports: [
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    OrigamiCheckbox,
    OrigamiSwitch,
    OrigamiField,
    OrigamiFieldControl,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
  ],
  host: { "data-order": "tooltip-first" },
  template: coApplied,
})
export class TooltipFirst extends CoApplied {
  readonly order = "tooltip-first";
}

/** The Field controls imported before the Tooltip: the control initializes first. */
@Component({
  selector: "acceptance-control-first",
  imports: [
    OrigamiCheckbox,
    OrigamiSwitch,
    OrigamiField,
    OrigamiFieldControl,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
  ],
  host: { "data-order": "control-first" },
  template: coApplied,
})
export class ControlFirst extends CoApplied {
  readonly order = "control-first";
}

/** A consumer Checkbox that is also its Tooltip's Trigger, both through `hostDirectives`. */
@Directive({
  selector: "button[describedCheckbox]",
  hostDirectives: [OrigamiTooltipTrigger, OrigamiCheckbox],
})
export class DescribedCheckbox {}

/**
 * Tooltip Content in a child component's view: Angular refreshes it after the parent view's host
 * bindings, so the Content registers after its Trigger's `aria-describedby` was first evaluated.
 */
@Component({
  selector: "acceptance-late-tooltip-content",
  imports: [OrigamiTooltipContent],
  template: `
    @if (mounted()) {
      <span ogTooltipContent [id]="contentId()">Late tip</span>
    }
  `,
})
export class LateTooltipContent {
  readonly contentId = input.required<string>();
  readonly mounted = input.required<boolean>();
}

@Component({
  selector: "acceptance-described-by-fixture",
  imports: [
    TooltipFirst,
    ControlFirst,
    DescribedCheckbox,
    LateTooltipContent,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    OrigamiCheckbox,
    OrigamiSwitch,
    OrigamiField,
    OrigamiFieldControl,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach co-applied description behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <p id="static-note">Static note</p>

    <section>
      <h2>Tooltip imported first</h2>
      <acceptance-tooltip-first />
    </section>
    <section>
      <h2>Field controls imported first</h2>
      <acceptance-control-first />
    </section>
    <section>
      <h2>Composed through hostDirectives</h2>
      <button
        type="button"
        data-testid="toggle-composed-content"
        (click)="composedContent.set(!composedContent())"
      >
        Mount or unmount the composed Tooltip Content
      </button>
      <div ogField>
        <span ogTooltip [openDelay]="0">
          <button describedCheckbox data-testid="composed"></button>
          @if (composedContent()) {
            <span ogTooltipContent id="composed-tip">Composed tip</span>
          }
        </span>
        <label ogFieldLabel>Composed checkbox</label>
        <p ogFieldDescription id="composed-description">Composed description</p>
      </div>
    </section>
    <section>
      <h2>Without a static aria-describedby</h2>
      <button
        type="button"
        data-testid="toggle-bare-content"
        (click)="bareContent.set(!bareContent())"
      >
        Mount or unmount the Tooltip Content
      </button>
      <button type="button" data-testid="toggle-bare-error" (click)="bareError.set(!bareError())">
        Show or clear the Field Errors
      </button>
      <span ogTooltip [openDelay]="0">
        <button ogTooltipTrigger data-testid="bare-trigger" aria-label="Bare trigger"></button>
        @if (bareContent()) {
          <span ogTooltipContent id="bare-trigger-tip">Trigger tip</span>
        }
      </span>
      <span ogTooltip [openDelay]="0">
        <button
          ogTooltipTrigger
          ogCheckbox
          data-testid="bare-checkbox"
          aria-label="Bare checkbox"
        ></button>
        @if (bareContent()) {
          <span ogTooltipContent id="bare-checkbox-tip">Checkbox tip</span>
        }
      </span>
      <span ogTooltip [openDelay]="0">
        <button ogTooltipTrigger data-testid="late-trigger" aria-label="Late trigger"></button>
        <acceptance-late-tooltip-content contentId="late-trigger-tip" [mounted]="bareContent()" />
      </span>
      <div ogField>
        <button ogCheckbox data-testid="bare-field-checkbox"></button>
        <label ogFieldLabel>Bare field checkbox</label>
        @if (bareError()) {
          <p ogFieldError id="bare-field-checkbox-error">Checkbox error</p>
        }
      </div>
      <div ogField>
        <button ogSwitch data-testid="bare-field-switch"></button>
        <label ogFieldLabel>Bare field switch</label>
        @if (bareError()) {
          <p ogFieldError id="bare-field-switch-error">Switch error</p>
        }
      </div>
      <div ogField>
        <input ogFieldControl data-testid="bare-field-input" />
        <label ogFieldLabel>Bare field input</label>
        @if (bareError()) {
          <p ogFieldError id="bare-field-input-error">Input error</p>
        }
      </div>
    </section>
    <section>
      <h2>Described from this view and a child component's</h2>
      <button
        type="button"
        data-testid="toggle-mixed-content"
        (click)="mixedContent.set(!mixedContent())"
      >
        Mount or unmount the child component's Tooltip Content
      </button>
      <button
        type="button"
        data-testid="toggle-mixed-error"
        (click)="mixedError.set(!mixedError())"
      >
        Show or clear the Field Errors
      </button>
      <div ogField>
        <span ogTooltip [openDelay]="0">
          <button ogTooltipTrigger ogCheckbox data-testid="mixed-checkbox"></button>
          <acceptance-late-tooltip-content
            contentId="mixed-checkbox-tip"
            [mounted]="mixedContent()"
          />
        </span>
        <label ogFieldLabel>Mixed checkbox</label>
        @if (mixedError()) {
          <p ogFieldError id="mixed-checkbox-error">Checkbox error</p>
        }
      </div>
      <div ogField>
        <span ogTooltip [openDelay]="0">
          <button ogTooltipTrigger ogSwitch data-testid="mixed-switch"></button>
          <acceptance-late-tooltip-content
            contentId="mixed-switch-tip"
            [mounted]="mixedContent()"
          />
        </span>
        <label ogFieldLabel>Mixed switch</label>
        @if (mixedError()) {
          <p ogFieldError id="mixed-switch-error">Switch error</p>
        }
      </div>
      <div ogField>
        <span ogTooltip [openDelay]="0">
          <input ogTooltipTrigger ogFieldControl data-testid="mixed-input" />
          <acceptance-late-tooltip-content contentId="mixed-input-tip" [mounted]="mixedContent()" />
        </span>
        <label ogFieldLabel>Mixed input</label>
        @if (mixedError()) {
          <p ogFieldError id="mixed-input-error">Input error</p>
        }
      </div>
    </section>
  `,
})
export class DescribedByFixture {
  readonly attached = signal(false);
  readonly composedContent = signal(true);
  readonly bareContent = signal(true);
  readonly bareError = signal(true);
  readonly mixedContent = signal(true);
  readonly mixedError = signal(true);
}

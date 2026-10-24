import { Component, signal } from "@angular/core";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";

// Select case Z18: how the list is named from the Trigger's static aria-label.

function flip(value: boolean): boolean {
  return !value;
}

@Component({
  selector: "select-naming-cases",
  imports: [
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiSelect,
    OrigamiSelectTrigger,
    OrigamiSelectContent,
    OrigamiSelectOption,
  ],
  template: `
    <section>
      <h2 id="naming-heading">List names</h2>

      <div ogSelect [(value)]="copied">
        <button ogSelectTrigger aria-label="Copied name" data-testid="copied-trigger">
          {{ copied() ?? "Choose" }}
        </button>
        <div ogSelectContent data-testid="copied-content" class="list">
          <div ogSelectOption value="one" data-testid="copied-one">One</div>
        </div>
      </div>

      <div ogSelect>
        <button ogSelectTrigger aria-label="Trigger name" data-testid="own-trigger">Own</button>
        <div ogSelectContent aria-label="Own name" data-testid="own-content" class="list">
          <div ogSelectOption value="one">One</div>
        </div>
      </div>

      <div ogSelect>
        <button ogSelectTrigger aria-label="Trigger name" data-testid="referenced-trigger">
          Referenced
        </button>
        <div
          ogSelectContent
          aria-labelledby="naming-heading"
          data-testid="referenced-content"
          class="list"
        >
          <div ogSelectOption value="one">One</div>
        </div>
      </div>

      <div ogSelect>
        <button ogSelectTrigger [attr.aria-label]="boundName()" data-testid="bound-trigger">
          Bound
        </button>
        <div ogSelectContent data-testid="bound-content" class="list">
          <div ogSelectOption value="one">One</div>
        </div>
      </div>

      <div ogField>
        @if (lateLabelShown()) {
          <span ogFieldLabel id="naming-late-label">Late label</span>
        }
        <div ogSelect>
          @if (lateTriggerShown()) {
            <button ogSelectTrigger aria-label="Late name" data-testid="naming-late-trigger">
              Late
            </button>
          }
          <div ogSelectContent data-testid="naming-late-content" class="list">
            <div ogSelectOption value="one">One</div>
          </div>
        </div>
      </div>
      <button
        type="button"
        data-testid="toggle-naming-late-label"
        (click)="lateLabelShown.update(flip)"
      >
        Toggle the late Label
      </button>
      <button
        type="button"
        data-testid="toggle-naming-late-trigger"
        (click)="lateTriggerShown.update(flip)"
      >
        Toggle the late Trigger
      </button>
    </section>
  `,
  styles: `
    .list {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
    }
  `,
})
export class SelectNamingCases {
  readonly flip = flip;
  readonly copied = signal<string | null>(null);
  readonly boundName = signal("Bound name");
  readonly lateLabelShown = signal(false);
  readonly lateTriggerShown = signal(true);
}

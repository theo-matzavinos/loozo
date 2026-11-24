import { Component, computed, signal } from "@angular/core";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import { QueryFieldBlock } from "./query-field-block.js";
import { reportAnalysis } from "./query-field-report.js";

// QF3, QF25. The block: a whole invalid report field in `@defer (hydrate on interaction)`, whose
// chunk the tests hold, behind a destroy/remount toggle. The split: one root in the fixture's
// view, inside a Field whose Label is outside every boundary, with its Input, Content and Errors in
// three sibling `@defer (hydrate when …)` boundaries. Alt+1, Alt+2 and Alt+3 anywhere hydrate the
// Input, Content and Errors boundaries: a key command, so no blur or outside press is needed.
// Without incremental hydration the server renders the boundaries' placeholders.

@Component({
  selector: "acceptance-query-field-split-fixture",
  host: { "(document:keydown)": "command($event)" },
  imports: [
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiQueryField,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldSuggestion,
    OrigamiQueryFieldMessage,
    OrigamiQueryFieldErrors,
    QueryFieldBlock,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach split query field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="block-toggle" (click)="blockMounted.set(!blockMounted())">
      Destroy or remount the block
    </button>
    <output data-testid="split-query">{{ query() }}</output>

    <section>
      <h2>Block</h2>
      @if (blockMounted()) {
        @defer (hydrate on interaction) {
          <acceptance-query-field-block />
        } @placeholder {
          <p>Block</p>
        }
      }
    </section>

    <section>
      <h2>Split</h2>
      <div ogField>
        <label ogFieldLabel data-testid="split-label">Διαχωρισμένη</label>
        <div
          ogQueryField
          #split="ogQueryField"
          class="field"
          [(query)]="query"
          (caretChange)="caret.set($event)"
          [analysis]="analysis()"
        >
          @defer (hydrate when inputHydrated()) {
            <input ogQueryFieldInput data-testid="split-input" />
          } @placeholder {
            <p>Input</p>
          }
          @defer (hydrate when contentHydrated()) {
            <div ogQueryFieldContent class="list" data-testid="split-content">
              @if (split.state.caretToken()?.error; as error) {
                <p ogQueryFieldMessage data-testid="split-message">{{ error }}</p>
              }
              @for (suggestion of split.state.suggestions(); track $index) {
                <div
                  ogQueryFieldSuggestion
                  [suggestion]="suggestion"
                  class="row"
                  [attr.data-testid]="'split-row-' + $index"
                >
                  {{ suggestion.label }}
                </div>
              }
            </div>
          } @placeholder {
            <p>Content</p>
          }
          @defer (hydrate when errorsHydrated()) {
            <div ogQueryFieldErrors hidden data-testid="split-errors">
              @for (token of split.state.tokens(); track token.start) {
                @if (token.error) {
                  <p>{{ token.error }}</p>
                }
              }
            </div>
          } @placeholder {
            <p>Errors</p>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: #eeeeee;
      background: #181818;
      padding: 16px;
    }
    output {
      display: block;
    }
    .field {
      position: relative;
      inline-size: 480px;
    }
    .list {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      margin: 0;
      min-inline-size: var(--og-anchor-width);
    }
  `,
})
export class QueryFieldSplitFixture {
  readonly attached = signal(false);
  readonly blockMounted = signal(true);
  readonly inputHydrated = signal(false);
  readonly contentHydrated = signal(false);
  readonly errorsHydrated = signal(false);
  readonly query = signal("report staus:open");
  readonly caret = signal<number | null>(null);
  readonly analysis = computed(() => reportAnalysis(this.query(), this.caret()));

  /** Alt+1, Alt+2 and Alt+3 hydrate the Input, Content and Errors boundaries. */
  command(event: KeyboardEvent): void {
    if (!event.altKey) {
      return;
    }

    if (event.code === "Digit1") {
      this.inputHydrated.set(true);
    } else if (event.code === "Digit2") {
      this.contentHydrated.set(true);
    } else if (event.code === "Digit3") {
      this.errorsHydrated.set(true);
    }
  }
}

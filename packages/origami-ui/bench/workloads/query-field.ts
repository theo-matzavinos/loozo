import { Component, computed, signal } from "@angular/core";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import type { OrigamiQueryAnalysis, OrigamiQuerySuggestion } from "@loozo/origami-ui/query-field";

interface Suggestion extends OrigamiQuerySuggestion {
  readonly label: string;
}

const invalid: OrigamiQueryAnalysis<Suggestion> = {
  query: "report staus:open",
  caret: 12,
  tokens: [
    { start: 0, end: 6 },
    { start: 7, end: 17, qualifier: { start: 7, end: 12 }, error: "Unknown filter" },
  ],
  suggestions: [
    { start: 7, end: 12, insert: "status", label: "status" },
    { start: 7, end: 12, insert: "sort", label: "sort" },
  ],
};

const valid: OrigamiQueryAnalysis<Suggestion> = {
  query: "report staus:open",
  caret: 12,
  tokens: [
    { start: 0, end: 6 },
    { start: 7, end: 17, qualifier: { start: 7, end: 12 } },
  ],
  suggestions: [],
};

@Component({
  selector: "bench-root, bench-query-field",
  imports: [
    OrigamiQueryField,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldSuggestion,
    OrigamiQueryFieldMessage,
    OrigamiQueryFieldErrors,
  ],
  template: `
    <div
      ogQueryField
      #qf="ogQueryField"
      [(query)]="query"
      (caretChange)="caret.set($event)"
      [analysis]="analysis()"
    >
      <input ogQueryFieldInput aria-label="Search reports" />
      <div ogQueryFieldContent>
        @if (qf.state.caretToken()?.error; as error) {
          <p ogQueryFieldMessage>{{ error }}</p>
        }
        @for (suggestion of qf.state.suggestions(); track $index) {
          <div ogQueryFieldSuggestion [suggestion]="suggestion">{{ suggestion.label }}</div>
        }
      </div>
      <div ogQueryFieldErrors hidden>
        @for (token of qf.state.tokens(); track token.start) {
          @if (token.error) {
            <p>{{ token.error }}</p>
          }
        }
      </div>
    </div>
    <button type="button" (click)="shape.set(shape() === invalid ? valid : invalid)">
      Swap the analysis
    </button>
  `,
})
export class Workload {
  protected readonly invalid = invalid;
  protected readonly valid = valid;
  readonly query = signal("report staus:open");
  readonly caret = signal<number | null>(12);
  readonly shape = signal(invalid);
  /** The held caret, published as null when it lies past the analysed query's end. */
  readonly analysis = computed((): OrigamiQueryAnalysis<Suggestion> => {
    const shape = this.shape();
    const held = this.caret();
    let caret: number | null = null;

    if (held !== null && held <= shape.query.length) {
      caret = held;
    }

    return { ...shape, caret };
  });
}

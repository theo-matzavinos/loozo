import { Component, PLATFORM_ID, computed, inject, signal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import { reportAnalysis } from "./query-field-report.js";

// QF3, QF25: an invalid report field in its own lazy chunk, which a `@defer (hydrate on
// interaction)` block loads. `data-query-field-block-rendered` marks the chunk the tests hold and
// is set once the browser renders the block. Its Content has a 1 s exit animation without reduced motion, so a teardown can land while it
// runs.

@Component({
  selector: "acceptance-query-field-block",
  host: { "[attr.data-query-field-block-rendered]": "clientRendered" },
  imports: [
    OrigamiQueryField,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldSuggestion,
    OrigamiQueryFieldMessage,
    OrigamiQueryFieldErrors,
  ],
  template: `
    <output data-testid="block-query">{{ query() }}</output>
    <output data-testid="block-query-changes">{{ queryChanges().join(",") }}</output>
    <output data-testid="block-carets">{{ carets().join(",") }}</output>
    <div
      ogQueryField
      #block="ogQueryField"
      class="field"
      [(query)]="query"
      (queryChange)="queryChanges.set([...queryChanges(), $event])"
      (caretChange)="caretChanged($event)"
      [analysis]="analysis()"
    >
      <input ogQueryFieldInput data-testid="block-input" aria-label="Μπλοκ" />
      <div ogQueryFieldContent class="list exit" data-testid="block-content">
        @if (block.state.caretToken()?.error; as error) {
          <p ogQueryFieldMessage>{{ error }}</p>
        }
        @for (suggestion of block.state.suggestions(); track $index) {
          <div
            ogQueryFieldSuggestion
            [suggestion]="suggestion"
            class="row"
            [attr.data-testid]="'block-row-' + $index"
          >
            {{ suggestion.label }}
          </div>
        }
      </div>
      <div ogQueryFieldErrors hidden>
        @for (token of block.state.tokens(); track token.start) {
          @if (token.error) {
            <p>{{ token.error }}</p>
          }
        }
      </div>
    </div>
  `,
  styles: `
    @media (prefers-reduced-motion: no-preference) {
      .exit[data-leaving] {
        animation: block-exit 1000ms linear;
      }
    }
    @keyframes block-exit {
      to {
        opacity: 0.2;
      }
    }
  `,
})
export class QueryFieldBlock {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly query = signal("report staus:open ");
  readonly caret = signal<number | null>(null);
  readonly queryChanges = signal<readonly string[]>([]);
  readonly carets = signal<readonly (number | null)[]>([]);
  readonly analysis = computed(() => reportAnalysis(this.query(), this.caret()));

  caretChanged(caret: number | null): void {
    this.caret.set(caret);
    this.carets.update((carets) => [...carets, caret]);
  }
}

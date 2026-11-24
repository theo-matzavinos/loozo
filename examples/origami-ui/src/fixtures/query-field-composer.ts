import {
  ChangeDetectorRef,
  Component,
  Directive,
  ElementRef,
  Injectable,
  computed,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldContentOptions,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldInputOptions,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldOptions,
  OrigamiQueryFieldState,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import { reportAnalysis } from "./query-field-report.js";
import type { ReportAnalysis, ReportSuggestion } from "./query-field-report.js";

// QF2, QF17, QF21: consumer directives that compose the query field through `hostDirectives`. The
// existing composer supplies the root's Options from its own model and inputs; the factory composer
// supplies plain signals and derives its analysis from the State's caret. Both replace the Input's
// and Content's IDs and log the State's Observables next to the forwarded outputs. The existing
// composer's analysis keeps one result per query and caret, and Keep mounts a row that holds the
// first suggestion across an Input swap. The factory composer's Message, rows and Errors carry
// authored IDs (QF2), and Replace recomputes its analysis at once, without a render (QF23).

/** The existing composer: its own query model and analysis input are the root's Options. */
@Directive({
  selector: "[acceptanceReportField]",
  exportAs: "acceptanceReportField",
  hostDirectives: [{ directive: OrigamiQueryField, outputs: ["search", "caretChange"] }],
  providers: [OrigamiQueryFieldOptions.provideExisting(() => ReportField)],
})
export class ReportField implements OrigamiQueryFieldOptions<ReportSuggestion> {
  readonly query = model("");
  readonly analysis = input<ReportAnalysis | null>(null);
  readonly disabled = input(false);
  readonly state = inject<OrigamiQueryFieldState<ReportSuggestion>>(OrigamiQueryFieldState);
  readonly log = signal<readonly string[]>([]);

  constructor() {
    this.state.caretChange.pipe(takeUntilDestroyed()).subscribe((caret) => {
      this.log.update((log) => [...log, `state-caret:${caret}`]);
    });
    this.state.search.pipe(takeUntilDestroyed()).subscribe((query) => {
      this.log.update((log) => [...log, `state-search:${query}`]);
    });
  }
}

/** Bumped to recompute the factory composer's analysis: the same stamp with new row objects. */
@Injectable()
class FactoryRefresh {
  readonly generation = signal(0);
}

/** The factory composer: plain signals, with the analysis derived from the State's caret. */
@Directive({
  selector: "[acceptanceFactoryReportField]",
  exportAs: "acceptanceFactoryReportField",
  hostDirectives: [
    { directive: OrigamiQueryField, outputs: ["search", "caretChange", "queryChange"] },
  ],
  providers: [
    FactoryRefresh,
    OrigamiQueryFieldOptions.provideFactory<ReportSuggestion>(() => {
      const query = signal("report staus:open");
      const state = inject<OrigamiQueryFieldState<ReportSuggestion>>(OrigamiQueryFieldState);
      const refresh = inject(FactoryRefresh);

      return {
        query,
        analysis: computed(() => {
          refresh.generation();

          return reportAnalysis(query(), state.caret());
        }),
        disabled: signal(false),
      };
    }),
  ],
})
export class FactoryReportField {
  readonly state = inject<OrigamiQueryFieldState<ReportSuggestion>>(OrigamiQueryFieldState);
  readonly #refresh = inject(FactoryRefresh);

  /** Replaces the rows at the same stamp at once: the plain signals reach the field without a render. */
  replaceRows(): void {
    this.#refresh.generation.update((generation) => generation + 1);
  }
}

/** An input whose replaced Options give it a fixed ID. */
@Directive({
  selector: "input[acceptanceReportInput]",
  hostDirectives: [OrigamiQueryFieldInput],
  providers: [
    OrigamiQueryFieldInputOptions.provideFactory(() => ({ id: signal("composer-input") })),
  ],
})
export class ReportInput {}

/** Content whose replaced Options give it a fixed ID and an 8 px gap. */
@Directive({
  selector: "[acceptanceReportContent]",
  hostDirectives: [OrigamiQueryFieldContent],
  providers: [
    OrigamiQueryFieldContentOptions.provideFactory(() => ({
      id: signal("composer-content"),
      side: signal<OrigamiPopoverSide>("block-end"),
      align: signal<OrigamiPopoverAlign>("start"),
      gap: signal(8),
    })),
  ],
})
export class ReportContent {}

@Component({
  selector: "acceptance-query-field-composer",
  imports: [
    OrigamiField,
    OrigamiFieldLabel,
    ReportField,
    FactoryReportField,
    ReportInput,
    ReportContent,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldSuggestion,
    OrigamiQueryFieldMessage,
    OrigamiQueryFieldErrors,
  ],
  template: `
    <section>
      <h2>Composer</h2>
      <button type="button" data-testid="composer-swap" (click)="swapped.set(!swapped())">
        Swap the Input
      </button>
      <button type="button" data-testid="composer-swap-at-8" (click)="swapAt.set(8)">
        Move focus away, swap the Input and focus the new one when caretChange reports 8
      </button>
      <button type="button" data-testid="composer-keep" (click)="keep()">
        Keep the first row mounted
      </button>
      <output data-testid="composer-query">{{ query() }}</output>
      <output data-testid="composer-log">{{ log().join(",") }}</output>
      <output data-testid="composer-state-log">{{ field.log().join(",") }}</output>
      <output data-testid="composer-first">{{ field.state.suggestions()[0]?.label ?? "" }}</output>
      <div ogField>
        <label ogFieldLabel data-testid="composer-label">Αναφορές</label>
        <div
          acceptanceReportField
          #field="acceptanceReportField"
          class="field"
          [(query)]="query"
          [analysis]="analysis()"
          (caretChange)="caretChanged($event)"
          (search)="log.set([...log(), 'search:' + $event])"
        >
          @if (swapped()) {
            <input ogQueryFieldInput data-testid="composer-swap-input" />
          } @else {
            <input acceptanceReportInput data-testid="composer-input" />
          }
          <div acceptanceReportContent class="list" data-testid="composer-content">
            @if (field.state.caretToken()?.error; as error) {
              <p ogQueryFieldMessage>{{ error }}</p>
            }
            @if (kept(); as kept) {
              <div
                ogQueryFieldSuggestion
                [suggestion]="kept"
                class="row"
                data-testid="composer-kept"
              >
                Κρατημένο {{ kept.label }}
              </div>
            }
            @for (suggestion of field.state.suggestions(); track $index) {
              <div
                ogQueryFieldSuggestion
                [suggestion]="suggestion"
                class="row"
                [attr.data-testid]="'composer-row-' + $index"
              >
                {{ suggestion.label }}
              </div>
            }
          </div>
          <div ogQueryFieldErrors hidden>
            @for (token of field.state.tokens(); track token.start) {
              @if (token.error) {
                <p>{{ token.error }}</p>
              }
            }
          </div>
        </div>
      </div>
    </section>

    <section>
      <h2>Factory composer</h2>
      <output data-testid="factory-query">{{ factory.state.query() }}</output>
      <output data-testid="factory-query-changes">{{ factoryQueryChanges() }}</output>
      <output data-testid="factory-carets">{{ factoryCarets().join(",") }}</output>
      <output data-testid="factory-searches">{{ factorySearches() }}</output>
      <button type="button" data-testid="factory-replace-rows" (click)="factory.replaceRows()">
        Replace the factory composer's rows
      </button>
      <div
        acceptanceFactoryReportField
        #factory="acceptanceFactoryReportField"
        class="field"
        (queryChange)="factoryQueryChanges.set(factoryQueryChanges() + 1)"
        (caretChange)="factoryCarets.set([...factoryCarets(), $event])"
        (search)="factorySearches.set(factorySearches() + 1)"
      >
        <input ogQueryFieldInput data-testid="factory-input" aria-label="Εργοστάσιο" />
        <div ogQueryFieldContent class="list" data-testid="factory-content">
          @if (factory.state.caretToken()?.error; as error) {
            <p ogQueryFieldMessage id="factory-message-id" data-testid="factory-message">
              {{ error }}
            </p>
          }
          @for (suggestion of factory.state.suggestions(); track $index) {
            <div
              ogQueryFieldSuggestion
              [suggestion]="suggestion"
              class="row"
              [id]="'factory-row-id-' + $index"
              [attr.data-testid]="'factory-row-' + $index"
            >
              {{ suggestion.label }}
            </div>
          }
        </div>
        <div ogQueryFieldErrors id="factory-errors-id" hidden data-testid="factory-errors">
          @for (token of factory.state.tokens(); track token.start) {
            @if (token.error) {
              <p>{{ token.error }}</p>
            }
          }
        </div>
      </div>
    </section>
  `,
})
export class QueryFieldComposer {
  readonly query = signal("report staus:open");
  readonly caret = signal<number | null>(null);
  readonly swapped = signal(false);
  /** A caret at which `caretChange` blurs, swaps the Input synchronously and focuses the new one, once. */
  readonly swapAt = signal<number | null>(null);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #changes = inject(ChangeDetectorRef);
  readonly log = signal<readonly string[]>([]);
  readonly factoryQueryChanges = signal(0);
  readonly factoryCarets = signal<readonly (number | null)[]>([]);
  readonly factorySearches = signal(0);
  readonly kept = signal<ReportSuggestion | null>(null);
  /** One analysis per query and caret, so a suggestion keeps its identity when its stamp returns. */
  readonly #analyses = new Map<string, ReportAnalysis>();
  readonly analysis = computed(() => {
    const query = this.query();
    const caret = this.caret();
    const key = `${caret}:${query}`;
    const kept = this.#analyses.get(key);

    if (kept !== undefined) {
      return kept;
    }

    const analysis = reportAnalysis(query, caret);

    this.#analyses.set(key, analysis);

    return analysis;
  });

  keep(): void {
    this.kept.set(this.analysis().suggestions?.[0] ?? null);
  }

  caretChanged(caret: number | null): void {
    this.caret.set(caret);
    this.log.update((log) => [...log, `caret:${caret}`]);

    if (caret !== null && caret === this.swapAt()) {
      const host = this.#host.nativeElement;

      this.swapAt.set(null);
      host.querySelector<HTMLElement>('[data-testid="composer-keep"]')?.focus();
      this.swapped.set(true);
      this.#changes.detectChanges();
      host.querySelector<HTMLElement>('[data-testid="composer-swap-input"]')?.focus();
    }
  }
}

import {
  Component,
  ElementRef,
  EnvironmentInjector,
  Injector,
  afterNextRender,
  ViewContainerRef,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID } from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogContent,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import type { OrigamiQueryAnalysis, OrigamiQueryToken } from "@loozo/origami-ui/query-field";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipTrigger,
} from "@loozo/origami-ui/tooltip";
import { QueryFieldComposer } from "./query-field-composer.js";
import { QueryFieldLate } from "./query-field-late.js";
import { reportAnalysis } from "./query-field-report.js";
import type { ReportAnalysis, ReportSuggestion } from "./query-field-report.js";

// Query field cases QF1–QF24 (QF2 and QF3 also run from hydration.spec.ts). Controls the tests
// use as script actions are buttons they click from script, so focus stays in the input. Each
// mount draws a mark layer from `state.segments()`, renders the Message and rows inside Content
// and the token errors in a hidden Errors, as the README's example does.

/** A Suggestion outside Content, mounted from code so its construction error can be caught. */
@Component({
  selector: "acceptance-query-field-stray",
  imports: [OrigamiQueryField, OrigamiQueryFieldInput, OrigamiQueryFieldSuggestion],
  template: `
    <div ogQueryField>
      <input ogQueryFieldInput aria-label="Stray" />
      <div ogQueryFieldSuggestion [suggestion]="{ start: 0, end: 0, insert: '' }">Stray</div>
    </div>
  `,
})
export class QueryFieldStray {}

/**
 * An inner query field without Content inside an outer one's Content: its Suggestion and its
 * Message find the outer Content's scope, which belongs to another query field, and throw.
 */
@Component({
  selector: "acceptance-query-field-nested-suggestion",
  imports: [
    OrigamiQueryField,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldSuggestion,
  ],
  template: `
    <div ogQueryField>
      <input ogQueryFieldInput aria-label="Outer" />
      <div ogQueryFieldContent>
        <div ogQueryField>
          <input ogQueryFieldInput aria-label="Inner" />
          <div ogQueryFieldSuggestion [suggestion]="{ start: 0, end: 0, insert: '' }">Inner</div>
        </div>
      </div>
    </div>
  `,
})
export class QueryFieldNestedSuggestion {}

/** As `QueryFieldNestedSuggestion`, with a misplaced Message. */
@Component({
  selector: "acceptance-query-field-nested-message",
  imports: [
    OrigamiQueryField,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldMessage,
  ],
  template: `
    <div ogQueryField>
      <input ogQueryFieldInput aria-label="Outer" />
      <div ogQueryFieldContent>
        <div ogQueryField>
          <input ogQueryFieldInput aria-label="Inner" />
          <p ogQueryFieldMessage>Inner</p>
        </div>
      </div>
    </div>
  `,
})
export class QueryFieldNestedMessage {}

/** A root with no parts: State probes read its analysis without anything else reading it. */
@Component({
  selector: "acceptance-query-field-validation",
  imports: [OrigamiQueryField],
  template: `
    <section>
      <h2>Validation</h2>
      @for (shape of shapes; track shape.name) {
        <button
          type="button"
          [attr.data-testid]="'validation-' + shape.name"
          (click)="probe(shape.name)"
        >
          {{ shape.name }}
        </button>
      }
      <output data-testid="validation-result">{{ result() }}</output>
      <div ogQueryField #root="ogQueryField" [query]="query()" [analysis]="analysis()"></div>
    </section>
  `,
})
export class QueryFieldValidation {
  readonly root = viewChild.required<OrigamiQueryField>("root");
  readonly query = signal("ab cd");
  readonly analysis = signal<OrigamiQueryAnalysis | null>(null);
  readonly result = signal("");

  readonly #injector = inject(Injector);
  readonly shapes: readonly {
    readonly name: string;
    readonly analysis: OrigamiQueryAnalysis | null;
  }[] = [
    { name: "fraction", analysis: this.#with([{ start: 0.5, end: 2 }]) },
    { name: "reversed", analysis: this.#with([{ start: 2, end: 1 }]) },
    { name: "outside", analysis: this.#with([{ start: 3, end: 9 }]) },
    { name: "empty-token", analysis: this.#with([{ start: 1, end: 1 }]) },
    {
      name: "overlap",
      analysis: this.#with([
        { start: 0, end: 3 },
        { start: 2, end: 5 },
      ]),
    },
    {
      name: "qualifier-start",
      analysis: this.#with([{ start: 0, end: 2, qualifier: { start: 1, end: 2 } }]),
    },
    {
      name: "qualifier-empty",
      analysis: this.#with([{ start: 0, end: 2, qualifier: { start: 0, end: 0 } }]),
    },
    { name: "error-empty", analysis: this.#with([{ start: 0, end: 2, error: "" }]) },
    { name: "caret", analysis: { query: "ab cd", caret: 6, tokens: [], suggestions: [] } },
    {
      name: "insert-break",
      analysis: {
        query: "ab cd",
        caret: 0,
        tokens: [],
        suggestions: [{ start: 0, end: 0, insert: "a\nb" }],
      },
    },
    { name: "query-break", analysis: { query: "ab\ncd", caret: 0, tokens: [], suggestions: [] } },
    { name: "root-query-break", analysis: null },
    {
      name: "valid",
      analysis: this.#with([
        { start: 0, end: 2, qualifier: { start: 0, end: 1 } },
        { start: 3, end: 5 },
      ]),
    },
  ];

  #with(tokens: readonly OrigamiQueryToken[]): OrigamiQueryAnalysis {
    return { query: "ab cd", caret: null, tokens, suggestions: [] };
  }

  probe(name: string): void {
    let analysis: OrigamiQueryAnalysis | null = null;

    for (const shape of this.shapes) {
      if (shape.name === name) {
        analysis = shape.analysis;
      }
    }

    if (name === "root-query-break") {
      this.query.set("ab\ncd");
    } else {
      this.query.set("ab cd");
    }

    this.analysis.set(analysis);

    // Read once the bindings refreshed.
    afterNextRender(
      () => {
        try {
          this.root().state.tokens();
          this.root().state.query();
          this.result.set(`${name}:ok`);
        } catch (error) {
          let kind = "Error";

          if (error instanceof RangeError) {
            kind = "RangeError";
          }

          this.result.set(`${name}:${kind}:${error instanceof Error ? error.message : ""}`);
        }
      },
      { injector: this.#injector },
    );
  }
}

@Component({
  selector: "acceptance-query-field-fixture",
  host: { "[attr.data-client-rendered]": "clientRendered" },
  imports: [
    OrigamiQueryField,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldSuggestion,
    OrigamiQueryFieldMessage,
    OrigamiQueryFieldErrors,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiTooltip,
    OrigamiTooltipTrigger,
    OrigamiTooltipContent,
    QueryFieldLate,
    QueryFieldComposer,
    QueryFieldValidation,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach query field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Report</h2>
      <button type="button" data-testid="report-write-short" (click)="query.set('r')">
        Write r
      </button>
      <button
        type="button"
        data-testid="report-write-long"
        (click)="query.set('report status:approved by:@me')"
      >
        Write a long query
      </button>
      <button
        type="button"
        data-testid="report-write-invalid-first"
        (click)="query.set('zz:a report')"
      >
        Write a query starting with an invalid token
      </button>
      <button type="button" data-testid="report-write-same" (click)="query.set(query())">
        Write the same query
      </button>
      <button type="button" data-testid="report-rewrite" (click)="rewrite.set(!rewrite())">
        Lower-case every edit
      </button>
      <button type="button" data-testid="report-disable" (click)="disabled.set(!disabled())">
        Toggle disabled
      </button>
      <button type="button" data-testid="report-hold-rows" (click)="rowsHeld.set(!rowsHeld())">
        Hold the rows
      </button>
      <button
        type="button"
        data-testid="report-hold-message"
        (click)="messageHeld.set(!messageHeld())"
      >
        Hold the Message
      </button>
      <button
        type="button"
        data-testid="report-message-off"
        (click)="messageOff.set(!messageOff())"
      >
        Drop the Message
      </button>
      <button
        type="button"
        data-testid="report-keep-message"
        (click)="messageKept.set(!messageKept())"
      >
        Keep the Message mounted
      </button>
      <button type="button" data-testid="report-keep-stale" (click)="keepStale()">
        Keep the first row mounted
      </button>
      <button type="button" data-testid="report-clear-stale" (click)="stale.set(null)">
        Drop the kept row
      </button>
      <button
        type="button"
        data-testid="report-toggle-content"
        (click)="contentMounted.set(!contentMounted())"
      >
        Toggle Content
      </button>
      <button type="button" data-testid="report-stale-analysis" (click)="staleAnalysis()">
        Bind a stale analysis
      </button>
      <button type="button" data-testid="report-zero-width" (click)="zeroWidth()">
        Offer an insertion
      </button>
      <button type="button" data-testid="report-current-analysis" (click)="override.set(null)">
        Bind the current analysis
      </button>
      <button type="button" data-testid="report-empty-analysis" (click)="emptyAnalysis()">
        Settle the current stamp to no suggestions
      </button>
      <div class="surface" data-testid="report-keep-focus" (mousedown)="$event.preventDefault()">
        A surface that keeps focus
      </div>
      <button type="button" data-testid="report-blur-at-8" (click)="blurAt.set(8)">
        Move focus away when caretChange reports 8
      </button>
      <button type="button" data-testid="report-refocus-at-8" (click)="refocusAt.set(8)">
        Move focus away and back, then ArrowDown at the end, when caretChange reports 8
      </button>
      <button type="button" data-testid="report-blur-on-edit" (click)="blurOnEdit.set(true)">
        Move focus away at the next queryChange
      </button>
      <button type="button" data-testid="report-reset-log" (click)="log.set([])">
        Reset the log
      </button>
      <output data-testid="report-query">{{ query() }}</output>
      <output data-testid="report-caret">{{ caret() ?? "null" }}</output>
      <output data-testid="report-log">{{ log().join(",") }}</output>
      <output data-testid="report-searches">{{ searches().join(",") }}</output>
      <output data-testid="report-state-query">{{ report.state.query() }}</output>
      <output data-testid="report-submits">{{ submits() }}</output>
      <output data-testid="report-open">{{ report.state.open() }}</output>
      <output data-testid="report-composing">{{ report.state.composing() }}</output>
      <output data-testid="report-scroll">{{ report.state.scrollLeft() }}</output>
      <output data-testid="report-invalid">{{ report.state.invalid() }}</output>
      <output data-testid="report-caret-token">{{ caretToken() }}</output>
      <output data-testid="report-segments">{{ segments() }}</output>
      <output data-testid="report-suggestions">{{ report.state.suggestions().length }}</output>
      <form data-testid="report-form" (submit)="submitted($event)">
        <div
          ogQueryField
          #report="ogQueryField"
          class="field"
          data-testid="report-root"
          [query]="query()"
          (queryChange)="queryChanged($event)"
          (caretChange)="caretChanged($event)"
          [analysis]="analysis()"
          [disabled]="disabled()"
          (search)="searches.set([...searches(), $event])"
        >
          <div
            class="marks"
            aria-hidden="true"
            data-testid="report-marks"
            [hidden]="report.state.composing()"
          >
            <div [style.translate.px]="-report.state.scrollLeft()">
              @for (segment of report.state.segments(); track segment.start) {
                <span
                  [attr.data-part]="segment.part"
                  [attr.data-invalid]="segment.token?.error ? '' : null"
                  >{{ segment.text }}</span
                >
              }
            </div>
          </div>
          <input
            #reportInput
            ogQueryFieldInput
            data-testid="report-input"
            aria-label="Αναζήτηση αναφορών"
          />
          @if (contentMounted()) {
            <div ogQueryFieldContent class="list" data-testid="report-content" [gap]="4">
              @if (!messageOff() && !messageHeld()) {
                @if (messageKept()) {
                  <p ogQueryFieldMessage data-testid="report-message">
                    {{ report.state.caretToken()?.error ?? "Κρατημένο μήνυμα" }}
                  </p>
                } @else if (report.state.caretToken()?.error; as error) {
                  <p ogQueryFieldMessage data-testid="report-message">{{ error }}</p>
                }
              }
              @if (stale(); as kept) {
                <div
                  ogQueryFieldSuggestion
                  [suggestion]="kept"
                  class="row"
                  data-testid="report-stale"
                >
                  Παλιά {{ kept.label }}
                </div>
              }
              @if (!rowsHeld()) {
                @for (suggestion of report.state.suggestions(); track $index) {
                  <div
                    ogQueryFieldSuggestion
                    [suggestion]="suggestion"
                    class="row"
                    [attr.data-testid]="'report-row-' + $index"
                  >
                    {{ suggestion.label }} <small>{{ suggestion.detail }}</small>
                  </div>
                }
              }
            </div>
          }
          <div ogQueryFieldErrors hidden data-testid="report-errors">
            @for (token of report.state.tokens(); track token.start) {
              @if (token.error) {
                <p>{{ token.error }}</p>
              }
            }
          </div>
        </div>
      </form>
      <button #reportAfter type="button" data-testid="report-after">After</button>
    </section>

    <acceptance-query-field-late />

    <section>
      <h2>Field</h2>
      <button
        type="button"
        data-testid="field-toggle-error"
        (click)="fieldError.set(!fieldError())"
      >
        Toggle the Field Error
      </button>
      <button
        type="button"
        data-testid="field-toggle-description"
        (click)="fieldDescription.set(!fieldDescription())"
      >
        Toggle the Field Description
      </button>
      <div ogField>
        <label ogFieldLabel data-testid="field-label">Αναφορές</label>
        <div
          ogQueryField
          #inField="ogQueryField"
          class="field"
          [(query)]="fieldQuery"
          (caretChange)="fieldCaret.set($event)"
          [analysis]="fieldAnalysis()"
        >
          <input ogQueryFieldInput data-testid="field-input" aria-required="true" />
          <div ogQueryFieldContent class="list" data-testid="field-content">
            @if (inField.state.caretToken()?.error; as error) {
              <p ogQueryFieldMessage>{{ error }}</p>
            }
            @for (suggestion of inField.state.suggestions(); track $index) {
              <div ogQueryFieldSuggestion [suggestion]="suggestion" class="row">
                {{ suggestion.label }}
              </div>
            }
          </div>
          <div ogQueryFieldErrors hidden data-testid="field-errors">
            @for (token of inField.state.tokens(); track token.start) {
              @if (token.error) {
                <p>{{ token.error }}</p>
              }
            }
          </div>
        </div>
        @if (fieldDescription()) {
          <p ogFieldDescription data-testid="field-description">Φίλτρα όπως status:submitted</p>
        }
        @if (fieldError()) {
          <p ogFieldError data-testid="field-error">Η αναζήτηση απέτυχε</p>
        }
      </div>
    </section>

    <section>
      <h2>Standalone description</h2>
      <p id="static-hint" data-testid="static-hint">Πληκτρολογήστε φίλτρα</p>
      <div
        ogQueryField
        #described="ogQueryField"
        class="field"
        [(query)]="describedQuery"
        (caretChange)="describedCaret.set($event)"
        [analysis]="describedAnalysis()"
      >
        <input
          ogQueryFieldInput
          data-testid="static-input"
          aria-label="Στατικά"
          aria-invalid="true"
          aria-required="true"
          aria-describedby="static-hint"
        />
        <div ogQueryFieldContent class="list"></div>
        <div ogQueryFieldErrors hidden>
          @for (token of described.state.tokens(); track token.start) {
            @if (token.error) {
              <p>{{ token.error }}</p>
            }
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Dialog</h2>
      <div ogDialog [(open)]="dialogOpen">
        <button ogDialogTrigger data-testid="dialog-trigger">Open the dialog</button>
        <dialog ogDialogContent data-testid="dialog-content" aria-label="Dialog">
          <button
            type="button"
            data-testid="dialog-toggle-content"
            (click)="dialogContent.set(!dialogContent())"
          >
            Toggle the list
          </button>
          <p data-testid="dialog-inside">Inside the dialog</p>
          <div class="surface" data-testid="dialog-surface" (mousedown)="$event.preventDefault()">
            A surface that keeps focus
          </div>
          <button
            #dialogLoadingButton
            type="button"
            data-testid="dialog-loading"
            (click)="dialogLoading.set(!dialogLoading())"
          >
            Toggle loading
          </button>
          <button
            type="button"
            data-testid="dialog-keep-message"
            (click)="dialogMessageKept.set(!dialogMessageKept())"
          >
            Keep the Message mounted
          </button>
          <button type="button" data-testid="dialog-focus-at-11" (click)="dialogFocusAt.set(11)">
            Focus Toggle loading when caretChange reports 11
          </button>
          <div
            ogQueryField
            #inDialog="ogQueryField"
            class="field"
            [(query)]="dialogQuery"
            (caretChange)="dialogCaretChanged($event)"
            [analysis]="dialogAnalysis()"
          >
            <input
              ogQueryFieldInput
              data-testid="dialog-input"
              aria-label="Αναζήτηση στον διάλογο"
            />
            @if (dialogContent()) {
              <div ogQueryFieldContent class="list" data-testid="dialog-list">
                @if (dialogMessageKept()) {
                  <p ogQueryFieldMessage>
                    {{ inDialog.state.caretToken()?.error ?? "Κρατημένο μήνυμα" }}
                  </p>
                } @else if (inDialog.state.caretToken()?.error; as error) {
                  <p ogQueryFieldMessage>{{ error }}</p>
                }
                @for (suggestion of inDialog.state.suggestions(); track $index) {
                  <div
                    ogQueryFieldSuggestion
                    [suggestion]="suggestion"
                    class="row"
                    [attr.data-testid]="'dialog-row-' + $index"
                  >
                    {{ suggestion.label }}
                  </div>
                }
              </div>
            }
          </div>
        </dialog>
      </div>
      <output data-testid="dialog-open">{{ dialogOpen() }}</output>
    </section>

    <section>
      <h2>Overflow</h2>
      <div
        ogQueryField
        #overflow="ogQueryField"
        class="field narrow"
        [(query)]="overflowQuery"
        (caretChange)="overflowCaret.set($event)"
        [analysis]="overflowAnalysis()"
      >
        <div class="marks ink" aria-hidden="true" data-testid="overflow-marks">
          <!-- textContent: in a white-space: pre layer no whitespace may surround the text. -->
          <div
            data-testid="overflow-row"
            [style.translate.px]="-overflow.state.scrollLeft()"
            [textContent]="overflow.state.query()"
          ></div>
        </div>
        <input ogQueryFieldInput data-testid="overflow-input" aria-label="Μακριά αναζήτηση" />
        <div ogQueryFieldContent class="list" data-testid="overflow-content">
          @for (suggestion of overflow.state.suggestions(); track $index) {
            <div
              ogQueryFieldSuggestion
              [suggestion]="suggestion"
              class="row"
              [attr.data-testid]="'overflow-row-' + $index"
            >
              {{ suggestion.label }}
            </div>
          }
        </div>
      </div>
      <output data-testid="overflow-scroll">{{ overflow.state.scrollLeft() }}</output>
    </section>

    <section>
      <h2>Spaced</h2>
      <div
        ogQueryField
        #spaced="ogQueryField"
        class="field narrow spaced"
        [(query)]="spacedQuery"
        (caretChange)="spacedCaret.set($event)"
        [analysis]="spacedAnalysis()"
      >
        <div class="marks ink" aria-hidden="true">
          <!-- textContent: in a white-space: pre layer no whitespace may surround the text. -->
          <div
            data-testid="spaced-row"
            [style.translate.px]="-spaced.state.scrollLeft()"
            [textContent]="spaced.state.query()"
          ></div>
        </div>
        <input ogQueryFieldInput data-testid="spaced-input" aria-label="Αραιή αναζήτηση" />
        <div ogQueryFieldContent class="list" data-testid="spaced-content">
          @for (suggestion of spaced.state.suggestions(); track $index) {
            <div
              ogQueryFieldSuggestion
              [suggestion]="suggestion"
              class="row"
              [attr.data-testid]="'spaced-row-' + $index"
            >
              {{ suggestion.label }}
            </div>
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Order</h2>
      <button
        type="button"
        data-testid="order-reverse"
        (click)="orderReversed.set(!orderReversed())"
      >
        Reverse the rows
      </button>
      <div
        ogQueryField
        #order="ogQueryField"
        class="field"
        [(query)]="orderQuery"
        (caretChange)="orderCaret.set($event)"
        [analysis]="orderAnalysis()"
      >
        <input ogQueryFieldInput data-testid="order-input" aria-label="Σειρά" />
        <div ogQueryFieldContent class="list" data-testid="order-content">
          @for (suggestion of ordered(order.state.suggestions()); track suggestion) {
            <div
              ogQueryFieldSuggestion
              [suggestion]="suggestion"
              class="row"
              [attr.data-testid]="'order-row-' + suggestion.label"
            >
              {{ suggestion.label }}
            </div>
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Tooltip rows</h2>
      <div
        ogQueryField
        #tipped="ogQueryField"
        class="field"
        [(query)]="tippedQuery"
        (caretChange)="tippedCaret.set($event)"
        [analysis]="tippedAnalysis()"
      >
        <input ogQueryFieldInput data-testid="tipped-input" aria-label="Με υποδείξεις" />
        <div ogQueryFieldContent class="list" data-testid="tipped-content">
          @if (tipped.state.caretToken()?.error; as error) {
            <p ogQueryFieldMessage data-testid="tipped-message">{{ error }}</p>
          }
          @for (suggestion of tipped.state.suggestions(); track $index) {
            <span ogTooltip>
              <div
                ogQueryFieldSuggestion
                ogTooltipTrigger
                [suggestion]="suggestion"
                class="row"
                [attr.data-testid]="'tipped-row-' + $index"
              >
                {{ suggestion.label }}
              </div>
              <span ogTooltipContent [attr.data-testid]="'tipped-tip-' + $index">{{
                suggestion.detail
              }}</span>
            </span>
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Readonly</h2>
      <div
        ogQueryField
        #readonlyField="ogQueryField"
        class="field"
        [(query)]="readonlyQuery"
        (caretChange)="readonlyCaret.set($event)"
        [analysis]="readonlyAnalysis()"
      >
        <input ogQueryFieldInput readonly data-testid="readonly-input" aria-label="Μόνο ανάγνωση" />
        <div ogQueryFieldContent class="list" data-testid="readonly-content">
          @for (suggestion of readonlyField.state.suggestions(); track $index) {
            <div
              ogQueryFieldSuggestion
              [suggestion]="suggestion"
              class="row"
              [attr.data-testid]="'readonly-row-' + $index"
            >
              {{ suggestion.label }}
            </div>
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Touching tokens</h2>
      <button
        type="button"
        data-testid="touching-swap"
        (click)="touchingFirstInvalid.set(!touchingFirstInvalid())"
      >
        Swap which token is invalid
      </button>
      <output data-testid="touching-token">{{ touchingToken() }}</output>
      <div
        ogQueryField
        #touching="ogQueryField"
        class="field"
        [(query)]="touchingQuery"
        (caretChange)="touchingCaret.set($event)"
        [analysis]="touchingAnalysis()"
      >
        <input ogQueryFieldInput data-testid="touching-input" aria-label="Εφαπτόμενα" />
      </div>
    </section>

    <section>
      <h2>Many</h2>
      <div
        ogQueryField
        #many="ogQueryField"
        class="field"
        data-testid="many-root"
        [(query)]="manyQuery"
        (caretChange)="manyCaret.set($event)"
        [analysis]="manyAnalysis()"
      >
        <input ogQueryFieldInput data-testid="many-input" aria-label="Πολλές" />
        <div ogQueryFieldContent class="list" data-testid="many-content" [gap]="4">
          @for (suggestion of many.state.suggestions(); track $index) {
            <div
              ogQueryFieldSuggestion
              [suggestion]="suggestion"
              class="row"
              [attr.data-testid]="'many-row-' + $index"
            >
              {{ suggestion.label }}
            </div>
          }
        </div>
      </div>
    </section>

    <section>
      <h2>Stray row</h2>
      <button type="button" data-testid="stray-mount" (click)="mountStray()">
        Mount a stray row
      </button>
      <button
        type="button"
        data-testid="stray-nested-suggestion"
        (click)="mountNested('suggestion')"
      >
        Mount a Suggestion inside another query field's Content
      </button>
      <button type="button" data-testid="stray-nested-message" (click)="mountNested('message')">
        Mount a Message inside another query field's Content
      </button>
      <output data-testid="stray-result">{{ strayResult() }}</output>
      <div #strayHost></div>
    </section>

    <acceptance-query-field-validation />
    <acceptance-query-field-composer />
  `,
  styles: `
    :host {
      display: block;
      color: #eeeeee;
      background: #181818;
      padding: 16px;
    }
    section {
      margin-block: 16px;
    }
    output {
      display: block;
    }
    .field {
      position: relative;
      inline-size: 480px;
      font:
        16px/24px system-ui,
        sans-serif;
    }
    .field input {
      position: relative;
      z-index: 1;
      box-sizing: border-box;
      inline-size: 100%;
      margin: 0;
      padding: 7px 10px;
      border: 1px solid #555555;
      font: inherit;
      color: inherit;
      background: transparent;
    }
    .marks {
      position: absolute;
      inset: 0;
      z-index: 0;
      box-sizing: border-box;
      padding: 7px 10px;
      border: 1px solid transparent;
      overflow: hidden;
      white-space: pre;
      color: transparent;
      pointer-events: none;
    }
    .marks [data-part="qualifier"] {
      background: rgb(120 160 255 / 0.3);
    }
    .marks [data-invalid] {
      text-decoration: underline wavy #ff6b6b;
    }
    .narrow {
      inline-size: 240px;
    }
    .spaced input,
    .spaced .marks {
      letter-spacing: 4px;
    }
    .surface {
      padding: 8px;
      border: 1px dashed #777777;
    }
    .ink {
      color: #ffffff;
      visibility: hidden;
    }
    .list {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      margin: 0;
      min-inline-size: var(--og-anchor-width);
      max-block-size: 200px;
      overflow-y: auto;
      box-sizing: border-box;
    }
    .row[data-active] {
      background: #3a4a6a;
    }
    [hidden] {
      display: none !important;
    }
  `,
})
export class QueryFieldFixture {
  private readonly strayHost = viewChild.required("strayHost", { read: ViewContainerRef });
  readonly #environment = inject(EnvironmentInjector);
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);

  readonly query = signal("report staus:open");
  readonly caret = signal<number | null>(null);
  readonly log = signal<readonly string[]>([]);
  readonly searches = signal<readonly string[]>([]);
  readonly submits = signal(0);
  readonly rewrite = signal(false);
  readonly disabled = signal(false);
  readonly rowsHeld = signal(false);
  readonly messageHeld = signal(false);
  readonly messageOff = signal(false);
  readonly messageKept = signal(false);
  /** A caret `caretChange` moves focus to `report-after` at, once; null when disarmed. */
  readonly blurAt = signal<number | null>(null);
  /**
   * A caret at which `caretChange` moves focus to `report-after`, back to the input at its end and
   * dispatches ArrowDown there, once; null when disarmed.
   */
  readonly refocusAt = signal<number | null>(null);
  private readonly reportInput = viewChild.required<ElementRef<HTMLInputElement>>("reportInput");
  /** Whether the next `queryChange` moves focus to `report-after`, once. */
  readonly blurOnEdit = signal(false);
  private readonly reportAfter = viewChild.required<ElementRef<HTMLButtonElement>>("reportAfter");
  readonly contentMounted = signal(true);
  readonly stale = signal<ReportSuggestion | null>(null);
  readonly override = signal<ReportAnalysis | null>(null);
  #separatorQueued = false;

  readonly analysis = computed(() => this.override() ?? reportAnalysis(this.query(), this.caret()));
  readonly caretToken = computed(() => {
    const token = this.reportState()?.caretToken() ?? null;

    if (token === null) {
      return "null";
    }

    return `${token.start}-${token.end}:${token.error ?? "valid"}`;
  });
  readonly segments = computed(() => {
    const segments = this.reportState()?.segments() ?? [];
    const parts: string[] = [];

    for (const segment of segments) {
      parts.push(`${segment.part}:${segment.text}`);
    }

    return parts.join("|");
  });
  private readonly reportRoot = viewChild<OrigamiQueryField<ReportSuggestion>>("report");
  readonly reportState = computed(() => this.reportRoot()?.state ?? null);

  readonly fieldQuery = signal("report status:draft");
  readonly fieldCaret = signal<number | null>(null);
  readonly fieldAnalysis = computed(() => reportAnalysis(this.fieldQuery(), this.fieldCaret()));
  readonly fieldError = signal(false);
  readonly fieldDescription = signal(true);

  readonly describedQuery = signal("report status:draft");
  readonly describedCaret = signal<number | null>(null);
  readonly describedAnalysis = computed(() =>
    reportAnalysis(this.describedQuery(), this.describedCaret()),
  );

  readonly dialogOpen = signal(false);
  readonly dialogContent = signal(true);
  readonly dialogMessageKept = signal(false);
  readonly dialogQuery = signal("report staus:open");
  readonly dialogCaret = signal<number | null>(null);
  /** A caret at which `caretChange` focuses `dialog-loading`, inside the Dialog, once; null when disarmed. */
  readonly dialogFocusAt = signal<number | null>(null);
  private readonly dialogLoadingButton =
    viewChild.required<ElementRef<HTMLButtonElement>>("dialogLoadingButton");
  readonly dialogLoading = signal(false);
  /** While loading, the same stamp's suggestions are `null`: presentation is suppressed. */
  readonly dialogAnalysis = computed((): ReportAnalysis => {
    const analysis = reportAnalysis(this.dialogQuery(), this.dialogCaret());

    if (this.dialogLoading()) {
      return { ...analysis, suggestions: null };
    }

    return analysis;
  });

  readonly overflowQuery = signal(
    "sta:open report κατάσταση:υποβλήθηκε by:@me submitted:2026-01-01..2026-03-31 υπόλοιπα staus:draft sort:submitted-desc",
  );
  readonly overflowCaret = signal<number | null>(null);
  readonly overflowAnalysis = computed(() =>
    reportAnalysis(this.overflowQuery(), this.overflowCaret()),
  );

  readonly spacedQuery = signal(
    "sta:open report κατάσταση:υποβλήθηκε by:@me submitted:2026-01-01..2026-03-31 υπόλοιπα staus:draft sort:submitted-desc",
  );
  readonly spacedCaret = signal<number | null>(null);
  readonly spacedAnalysis = computed(() => reportAnalysis(this.spacedQuery(), this.spacedCaret()));

  readonly orderQuery = signal("abc");
  readonly orderCaret = signal<number | null>(null);
  readonly orderReversed = signal(false);
  /** One suggestion set per caret, so a row keeps its suggestion object across refreshes. */
  readonly #orderRows = new Map<number, readonly ReportSuggestion[]>();
  readonly orderAnalysis = computed((): OrigamiQueryAnalysis<ReportSuggestion> => {
    const query = this.orderQuery();
    const held = this.orderCaret();

    if (held === null || held > query.length) {
      return { query, caret: null, tokens: [], suggestions: [] };
    }

    const kept = this.#orderRows.get(held);

    if (kept !== undefined) {
      return { query, caret: held, tokens: [], suggestions: kept };
    }

    const suggestions: ReportSuggestion[] = [];

    for (const label of ["A", "B", "C"]) {
      suggestions.push({ start: held, end: held, insert: label, label, detail: "" });
    }

    this.#orderRows.set(held, suggestions);

    return { query, caret: held, tokens: [], suggestions };
  });

  readonly tippedQuery = signal("report staus:open");
  readonly tippedCaret = signal<number | null>(null);
  readonly tippedAnalysis = computed(() => reportAnalysis(this.tippedQuery(), this.tippedCaret()));

  readonly readonlyQuery = signal("report st");
  readonly readonlyCaret = signal<number | null>(null);
  readonly readonlyAnalysis = computed(() =>
    reportAnalysis(this.readonlyQuery(), this.readonlyCaret()),
  );

  readonly touchingQuery = signal("abcd");
  readonly touchingCaret = signal<number | null>(null);
  readonly touchingFirstInvalid = signal(true);
  readonly touchingAnalysis = computed((): OrigamiQueryAnalysis => {
    const query = this.touchingQuery();
    const first: OrigamiQueryToken = { start: 0, end: 2 };
    const second: OrigamiQueryToken = { start: 2, end: 4 };

    if (query !== "abcd") {
      return { query, caret: null, tokens: [], suggestions: [] };
    }

    if (this.touchingFirstInvalid()) {
      return { query, caret: null, tokens: [{ ...first, error: "ab" }, second], suggestions: [] };
    }

    return { query, caret: null, tokens: [first, { ...second, error: "cd" }], suggestions: [] };
  });
  private readonly touchingRoot = viewChild<OrigamiQueryField>("touching");
  readonly touchingToken = computed(() => {
    const token = this.touchingRoot()?.state.caretToken() ?? null;

    if (token === null) {
      return "null";
    }

    return `${token.start}-${token.end}`;
  });

  readonly manyQuery = signal("item");
  readonly manyCaret = signal<number | null>(null);
  readonly manyAnalysis = computed((): OrigamiQueryAnalysis<ReportSuggestion> => {
    const query = this.manyQuery();
    const held = this.manyCaret();
    const suggestions: ReportSuggestion[] = [];

    if (held === null || held > query.length) {
      return { query, caret: null, tokens: [], suggestions };
    }

    for (let index = 1; index <= 30; index += 1) {
      suggestions.push({
        start: held,
        end: held,
        insert: ` ${index}`,
        label: `Item ${index}`,
        detail: "",
      });
    }

    return { query, caret: held, tokens: [], suggestions };
  });

  readonly strayResult = signal("");

  dialogCaretChanged(caret: number | null): void {
    this.dialogCaret.set(caret);

    if (caret !== null && caret === this.dialogFocusAt()) {
      this.dialogFocusAt.set(null);
      this.dialogLoadingButton().nativeElement.focus();
    }
  }

  queryChanged(text: string): void {
    this.#record(`q:${text}`);

    if (this.blurOnEdit()) {
      this.blurOnEdit.set(false);
      this.reportAfter().nativeElement.focus();
    }

    // The README's normalization pattern: a one-way `[query]` and this one handler, which writes
    // the root's own model too when it changes the text, since an unchanged binding expression
    // wouldn't restore the query an edit replaced.
    const next = this.rewrite() ? text.toLowerCase() : text;

    this.query.set(next);

    if (next !== text) {
      this.reportRoot()?.query.set(next);
    }
  }

  caretChanged(caret: number | null): void {
    this.caret.set(caret);
    this.#record(`c:${caret}`);

    if (caret !== null && caret === this.blurAt()) {
      this.blurAt.set(null);
      this.reportAfter().nativeElement.focus();
    }

    if (caret !== null && caret === this.refocusAt()) {
      const input = this.reportInput().nativeElement;

      this.refocusAt.set(null);
      this.reportAfter().nativeElement.focus();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    }
  }

  submitted(event: Event): void {
    event.preventDefault();
    this.submits.update((count) => count + 1);
  }

  keepStale(): void {
    const first = this.reportState()?.suggestions()[0] ?? null;

    this.stale.set(first);
  }

  /** Binds an analysis stamped for another query, with an invalid token. */
  staleAnalysis(): void {
    const query = "report zz:";

    this.override.set({ ...reportAnalysis(query, query.length), query });
  }

  /** A same-stamp reply that settles the current query and caret to no suggestions. */
  emptyAnalysis(): void {
    const analysis = reportAnalysis(this.query(), this.caret());

    this.override.set({ ...analysis, suggestions: [] });
  }

  /** Offers a zero-width suggestion: `by:@me ` inserted at the caret. */
  zeroWidth(): void {
    const query = this.query();
    const caret = this.caret();

    if (caret === null) {
      return;
    }

    this.override.set({
      query,
      caret,
      tokens: reportAnalysis(query, caret).tokens,
      suggestions: [
        { start: caret, end: caret, insert: "by:@me ", label: "by:@me", detail: "insert" },
      ],
    });
  }

  ordered(suggestions: readonly ReportSuggestion[]): readonly ReportSuggestion[] {
    if (!this.orderReversed()) {
      return suggestions;
    }

    const reversed: ReportSuggestion[] = [];

    for (let index = suggestions.length - 1; index >= 0; index -= 1) {
      reversed.push(suggestions[index]);
    }

    return reversed;
  }

  mountNested(kind: "suggestion" | "message"): void {
    try {
      if (kind === "suggestion") {
        this.strayHost().createComponent(QueryFieldNestedSuggestion, {
          environmentInjector: this.#environment,
        });
      } else {
        this.strayHost().createComponent(QueryFieldNestedMessage, {
          environmentInjector: this.#environment,
        });
      }

      this.strayResult.set(`nested-${kind}:mounted`);
    } catch (error) {
      this.strayResult.set(`nested-${kind}:${error instanceof Error ? error.message : ""}`);
    }
  }

  mountStray(): void {
    try {
      this.strayHost().createComponent(QueryFieldStray, { environmentInjector: this.#environment });
      this.strayResult.set("mounted");
    } catch (error) {
      this.strayResult.set(error instanceof Error ? error.message : "");
    }
  }

  /** Logs an event, then a `|` once the task's microtasks ran, so one task's events sit together. */
  #record(entry: string): void {
    this.log.update((log) => [...log, entry]);

    if (this.#separatorQueued) {
      return;
    }

    this.#separatorQueued = true;
    queueMicrotask(() => {
      this.#separatorQueued = false;
      this.log.update((log) => [...log, "|"]);
    });
  }
}

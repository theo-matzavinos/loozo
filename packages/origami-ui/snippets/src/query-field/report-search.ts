import { Component, computed, input, resource, signal } from "@angular/core";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import type {
  OrigamiQueryAnalysis,
  OrigamiQueryRange,
  OrigamiQuerySuggestion,
  OrigamiQueryToken,
} from "@loozo/origami-ui/query-field";

interface ReportSuggestion extends OrigamiQuerySuggestion {
  readonly label: string;
  readonly detail: string;
}

/** What completes the caret's token: rows now, or people to look up for a range. */
type Completion =
  | { readonly rows: readonly ReportSuggestion[] }
  | { readonly people: OrigamiQueryRange; readonly typed: string };

interface UserReply {
  readonly query: string;
  readonly caret: number;
  readonly items: readonly ReportSuggestion[];
}

const qualifiers = ["status", "by", "sort"];
const statuses = ["draft", "submitted", "approved"];
const people = ["alice", "bob", "chris"];

/** Your parser: runs of non-space text; `key:value` has the qualifier `key`. */
function tokensOf(query: string): OrigamiQueryToken[] {
  const tokens: OrigamiQueryToken[] = [];

  for (const match of query.matchAll(/\S+/g)) {
    const start = match.index;
    const end = start + match[0].length;
    const colon = match[0].indexOf(":");

    if (colon <= 0) {
      tokens.push({ start, end });

      continue;
    }

    const name = match[0].slice(0, colon);
    const qualifier = { start, end: start + colon };

    if (qualifiers.includes(name)) {
      tokens.push({ start, end, qualifier });
    } else {
      tokens.push({ start, end, qualifier, error: `Unknown filter “${name}”` });
    }
  }

  return tokens;
}

/** Suggestions replacing `range` with each candidate that starts with what's typed before the caret. */
function rowsFor(
  candidates: readonly string[],
  range: OrigamiQueryRange,
  typed: string,
  suffix: string,
): ReportSuggestion[] {
  const rows: ReportSuggestion[] = [];

  for (const candidate of candidates) {
    if (candidate.startsWith(typed)) {
      rows.push({ ...range, insert: candidate + suffix, label: candidate, detail: "" });
    }
  }

  return rows;
}

/** A pretend server lookup that takes a moment. */
async function lookupPeople(typed: string, signal: AbortSignal): Promise<readonly string[]> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 300);

    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

  return people.filter((person) => person.startsWith(typed));
}

// You parse and look suggestions up; the query field applies them to the text and caret they're
// for, and a pick edits the query in place, undoably.
@Component({
  selector: "app-report-search",
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
      class="field"
      [(query)]="query"
      (caretChange)="caret.set($event)"
      [analysis]="analysis()"
      [disabled]="disabled()"
      (search)="searched.set($event)"
    >
      <div class="marks" aria-hidden="true" [hidden]="qf.state.composing()">
        <div [style.translate.px]="-qf.state.scrollLeft()">
          @for (segment of qf.state.segments(); track segment.start) {
            <span [attr.data-part]="segment.part" [class.invalid]="segment.token?.error">{{
              segment.text
            }}</span>
          }
        </div>
      </div>
      <input
        ogQueryFieldInput
        aria-label="Search reports"
        placeholder="status:submitted by:alice"
      />
      <div ogQueryFieldContent class="list" [gap]="4">
        @if (qf.state.caretToken()?.error; as error) {
          <p ogQueryFieldMessage class="message">{{ error }}</p>
        }
        @for (suggestion of qf.state.suggestions(); track $index) {
          <div ogQueryFieldSuggestion [suggestion]="suggestion" class="row">
            {{ suggestion.label }}
          </div>
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
    <p>Searched: {{ searched() ?? "nothing yet" }}</p>
  `,
  styles: `
    .field {
      position: relative;
      inline-size: 24rem;
      font:
        1rem/1.5 system-ui,
        sans-serif;
    }

    input,
    .marks {
      box-sizing: border-box;
      inline-size: 100%;
      margin: 0;
      padding: 0.375rem 0.625rem;
      border: 1px solid currentColor;
      font: inherit;
    }

    input {
      position: relative;
      z-index: 1;
      background: transparent;
      color: inherit;
    }

    .marks {
      position: absolute;
      inset: 0;
      overflow: hidden;
      white-space: pre;
      color: transparent;
      border-color: transparent;
      pointer-events: none;
    }

    [data-part="qualifier"] {
      background: color-mix(in srgb, currentColor 15%, transparent);
    }

    .invalid {
      text-decoration: underline wavy red;
    }

    .list {
      min-inline-size: var(--og-anchor-width);
      padding: 0.25rem;
      border: 1px solid currentColor;
      background: Canvas;
      color: CanvasText;
    }

    .row[data-active] {
      background: color-mix(in srgb, currentColor 20%, transparent);
    }

    [hidden] {
      display: none !important;
    }
  `,
})
export class ReportSearch {
  readonly disabled = input(false);
  readonly query = signal("report staus:open by:");
  readonly caret = signal<number | null>(null);
  readonly searched = signal<string | null>(null);
  readonly #tokens = computed(() => tokensOf(this.query()));

  /** A caret you still hold past the end, just after a shorter query was written, isn't one. */
  readonly #caret = computed(() => {
    const caret = this.caret();

    if (caret === null || caret > this.query().length) {
      return null;
    }

    return caret;
  });

  /** The token at the caret, and whether the caret is in its qualifier or its value. */
  readonly #completion = computed((): Completion | null => {
    const caret = this.#caret();

    if (caret === null) {
      return null;
    }

    for (const token of this.#tokens()) {
      if (token.start > caret || token.end < caret) {
        continue;
      }

      const qualifier = token.qualifier;
      const query = this.query();

      if (qualifier === undefined || caret <= qualifier.end) {
        const range = qualifier ?? token;
        const typed = query.slice(range.start, caret);

        return { rows: rowsFor(qualifiers, range, typed, qualifier ? "" : ":") };
      }

      const value = { start: qualifier.end + 1, end: token.end };
      const name = query.slice(qualifier.start, qualifier.end);
      const typed = query.slice(value.start, caret);

      if (name === "by") {
        return { people: value, typed };
      }

      if (name === "status") {
        return { rows: rowsFor(statuses, value, typed, "") };
      }

      return { rows: [] };
    }

    return null;
  });

  // resource() aborts the previous load when its params change, so a superseded reply never lands.
  readonly #people = resource({
    params: () => {
      const caret = this.#caret();
      const completion = this.#completion();

      if (caret === null || completion === null || !("people" in completion)) {
        return undefined;
      }

      return { query: this.query(), caret, range: completion.people, typed: completion.typed };
    },
    loader: async ({ params, abortSignal }): Promise<UserReply> => {
      const { query, caret, range, typed } = params;

      try {
        const found = await lookupPeople(typed, abortSignal);

        return { query, caret, items: rowsFor(found, range, typed, "") };
      } catch (error) {
        if (abortSignal.aborted) {
          throw error;
        }

        return { query, caret, items: [] };
      }
    },
  });

  readonly analysis = computed((): OrigamiQueryAnalysis<ReportSuggestion> => {
    const query = this.query();
    const caret = this.#caret();
    const completion = this.#completion();
    let suggestions: readonly ReportSuggestion[] | null = [];

    if (completion !== null && "people" in completion) {
      // Loading until a reply stamped for this query and caret arrives.
      suggestions = null;

      if (this.#people.hasValue()) {
        const reply = this.#people.value();

        if (reply.query === query && reply.caret === caret) {
          suggestions = reply.items;
        }
      }
    } else if (completion !== null) {
      suggestions = completion.rows;
    }

    return { query, caret, tokens: this.#tokens(), suggestions };
  });
}

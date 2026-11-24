import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  resource,
  signal,
  viewChild,
} from "@angular/core";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import type { OrigamiQueryRange } from "@loozo/origami-ui/query-field";
import { reportCompletion, reportTokens, valueRows } from "./query-field-report.js";
import type { ReportAnalysis, ReportSuggestion } from "./query-field-report.js";

// QF7, QF11, QF19, QF23: `by:` users load through the README's `resource()` pattern. Each lookup waits
// for the test: Deliver resolves the newest pending one, Deliver all resolves every pending one
// oldest first, Reject fails the newest. Replace delivers Alex and Bob at the current stamp, and
// Stale binds an analysis stamped for an older query after the current one. Write r shortens the
// query from outside; the lookup log records each lookup's query and caret.

interface UserReply {
  readonly query: string;
  readonly caret: number;
  readonly items: readonly ReportSuggestion[];
}

interface Pending {
  readonly range: OrigamiQueryRange;
  readonly prefix: string;
  readonly query: string;
  readonly resolve: () => void;
  readonly reject: () => void;
}

const lateUsers = [
  { insert: "alice", label: "Alice", detail: "alice@example.com" },
  { insert: "bob", label: "Bob", detail: "bob@example.com" },
  { insert: "chris", label: "Chris", detail: "chris@example.com" },
];

@Component({
  selector: "acceptance-query-field-late",
  imports: [
    OrigamiQueryField,
    OrigamiQueryFieldInput,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldSuggestion,
    OrigamiQueryFieldMessage,
    OrigamiQueryFieldErrors,
  ],
  template: `
    <section>
      <h2>Late</h2>
      <button type="button" data-testid="late-deliver" (click)="deliver()">Deliver</button>
      <button type="button" data-testid="late-deliver-all" (click)="deliverAll()">
        Deliver all
      </button>
      <button type="button" data-testid="late-reject" (click)="reject()">Reject</button>
      <button type="button" data-testid="late-replace" (click)="replace()">Replace</button>
      <button type="button" data-testid="late-stale" (click)="bindStale()">Stale</button>
      <button type="button" data-testid="late-unstale" (click)="unbindStale()">Current</button>
      <button
        type="button"
        data-testid="late-toggle-content"
        (click)="contentMounted.set(!contentMounted())"
      >
        Toggle Content
      </button>
      <button type="button" data-testid="late-reset-leaving" (click)="leaving.set(0)">
        Reset the exit count
      </button>
      <button type="button" data-testid="late-write-short" (click)="query.set('r')">Write r</button>
      <output data-testid="late-query">{{ query() }}</output>
      <output data-testid="late-caret">{{ caret() ?? "null" }}</output>
      <output data-testid="late-pending">{{ pendingCount() }}</output>
      <output data-testid="late-requests">{{ requests() }}</output>
      <output data-testid="late-lookups">{{ lookups().join(",") }}</output>
      <output data-testid="late-open">{{ late.state.open() }}</output>
      <output data-testid="late-leaving">{{ leaving() }}</output>
      <output data-testid="late-searches">{{ searches() }}</output>

      <div
        ogQueryField
        #late="ogQueryField"
        class="field"
        [(query)]="query"
        (caretChange)="caret.set($event)"
        [analysis]="analysis()"
        (search)="searches.set(searches() + 1)"
      >
        <input ogQueryFieldInput data-testid="late-input" aria-label="Αναζήτηση με χρήστη" />
        @if (contentMounted()) {
          <div ogQueryFieldContent #content class="list exit" data-testid="late-content">
            @if (late.state.caretToken()?.error; as error) {
              <p ogQueryFieldMessage data-testid="late-message">{{ error }}</p>
            }
            @for (suggestion of late.state.suggestions(); track $index) {
              <div
                ogQueryFieldSuggestion
                [suggestion]="suggestion"
                class="row"
                [attr.data-testid]="'late-row-' + $index"
              >
                {{ suggestion.label }}
              </div>
            }
          </div>
        }
        <div ogQueryFieldErrors hidden>
          @for (token of late.state.tokens(); track token.start) {
            @if (token.error) {
              <p>{{ token.error }}</p>
            }
          }
        </div>
      </div>
      <div class="surface" data-testid="late-surface" (mousedown)="$event.preventDefault()">
        A surface that keeps focus
      </div>
      <button type="button" data-testid="late-outside">Outside</button>
    </section>
  `,
  styles: `
    .exit[data-leaving] {
      animation: late-exit 150ms linear;
    }
    @keyframes late-exit {
      to {
        opacity: 0.2;
      }
    }
    .surface {
      padding: 8px;
      border: 1px dashed #777777;
      inline-size: 240px;
    }
  `,
})
export class QueryFieldLate {
  readonly query = signal("report ");
  readonly caret = signal<number | null>(null);
  readonly contentMounted = signal(true);
  readonly searches = signal(0);
  readonly leaving = signal(0);
  readonly requests = signal(0);
  /** Every lookup's query and caret, as `query@caret`. */
  readonly lookups = signal<readonly string[]>([]);
  readonly #pending = signal<readonly Pending[]>([]);
  readonly pendingCount = computed(() => this.#pending().length);
  readonly #stale = signal<ReportAnalysis | null>(null);
  private readonly content = viewChild<ElementRef<HTMLElement>>("content");
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly #tokens = computed(() => reportTokens(this.query()));

  /** A caret the consumer holds past the query's end is published as null. */
  readonly #caret = computed(() => {
    const caret = this.caret();

    if (caret === null || caret > this.query().length) {
      return null;
    }

    return caret;
  });

  readonly #completion = computed(() => {
    const caret = this.#caret();

    if (caret === null) {
      return null;
    }

    return reportCompletion(this.query(), this.#tokens(), caret);
  });

  // resource() aborts the previous load when its params change, so a superseded reply never lands.
  readonly #users = resource({
    params: () => {
      const caret = this.#caret();
      const completion = this.#completion();

      if (caret === null || completion === null || !("users" in completion)) {
        return undefined;
      }

      return { query: this.query(), caret, range: completion.users, prefix: completion.prefix };
    },
    loader: async ({ params, abortSignal }): Promise<UserReply> => {
      const { query, caret, range, prefix } = params;

      this.lookups.update((lookups) => [...lookups, `${query}@${caret}`]);

      try {
        await this.#wait(range, prefix, query, abortSignal);

        return { query, caret, items: valueRows(lateUsers, range, prefix, query) };
      } catch (error) {
        if (abortSignal.aborted) {
          throw error;
        }

        return { query, caret, items: [] };
      }
    },
  });

  readonly analysis = computed((): ReportAnalysis => {
    const stale = this.#stale();

    if (stale !== null) {
      return stale;
    }

    const query = this.query();
    const caret = this.#caret();
    const tokens = this.#tokens();
    const completion = this.#completion();
    let suggestions: readonly ReportSuggestion[] | null = [];

    if (completion !== null && "users" in completion) {
      suggestions = null;

      if (this.#users.hasValue()) {
        const reply = this.#users.value();

        if (reply.query === query && reply.caret === caret) {
          suggestions = reply.items;
        }
      }
    } else if (completion !== null) {
      suggestions = completion.rows;
    }

    return { query, caret, tokens, suggestions };
  });

  constructor() {
    afterNextRender(() => {
      const observer = new MutationObserver(() => {
        const content = this.content()?.nativeElement;

        if (content?.hasAttribute("data-leaving")) {
          this.leaving.update((count) => count + 1);
        }
      });

      observer.observe(this.#host, {
        attributes: true,
        attributeFilter: ["data-leaving"],
        subtree: true,
      });
    });
  }

  deliver(): void {
    const pending = this.#pending();
    const newest = pending.at(-1);

    if (newest !== undefined) {
      this.#pending.set(pending.slice(0, -1));
      newest.resolve();
    }
  }

  deliverAll(): void {
    const pending = this.#pending();

    this.#pending.set([]);

    for (const request of pending) {
      request.resolve();
    }
  }

  reject(): void {
    const pending = this.#pending();
    const newest = pending.at(-1);

    if (newest !== undefined) {
      this.#pending.set(pending.slice(0, -1));
      newest.reject();
    }
  }

  /** A second reply for the current stamp: Alex and Bob, new objects. */
  replace(): void {
    const caret = this.#caret();
    const completion = this.#completion();

    if (caret === null || completion === null || !("users" in completion)) {
      return;
    }

    const items: ReportSuggestion[] = [
      { ...completion.users, insert: "alex", label: "Alex", detail: "alex@example.com" },
      { ...completion.users, insert: "bob", label: "Bob", detail: "bob@example.com" },
    ];

    this.#users.set({ query: this.query(), caret, items });
  }

  /** Binds an analysis stamped for another query, with an invalid token, after the current one. */
  bindStale(): void {
    const query = `${this.query()} zz:`;

    this.#stale.set({ query, caret: query.length, tokens: reportTokens(query), suggestions: [] });
  }

  /** Binds the current analysis again. */
  unbindStale(): void {
    this.#stale.set(null);
  }

  #wait(
    range: OrigamiQueryRange,
    prefix: string,
    query: string,
    abortSignal: AbortSignal,
  ): Promise<void> {
    this.requests.update((count) => count + 1);

    return new Promise<void>((resolve, reject) => {
      const request: Pending = {
        range,
        prefix,
        query,
        resolve,
        reject: () => reject(new Error("Lookup failed")),
      };

      abortSignal.addEventListener("abort", () => {
        this.#pending.update((pending) => pending.filter((entry) => entry !== request));
        reject(abortSignal.reason);
      });
      this.#pending.update((pending) => [...pending, request]);
    });
  }
}

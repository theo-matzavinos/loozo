# Query field

A query field is one native single-line input whose text is a query of tokens, such as `report status:submitted by:@me`, with a popup list of suggestions for the token at the caret. You parse the query and look suggestions up; the query field applies your analysis to the text and caret it was computed for, opens and closes the list, and edits the query in place when a suggestion is picked, through the browser's own insertion, so Ctrl+Z undoes it. It marks nothing itself: you draw marks behind the input from its State, so the input keeps its native glyphs, caret, selection and input methods.

It isn't a [Combobox](../combobox/README.md): there's no value, a pick edits part of the text, and closing the list never reverts what was typed.

[src/query-field/report-search.ts](../snippets/src/query-field/report-search.ts "playground")

| Directive                | Configuration                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogQueryField`           | `[(query)]` (default `""`), `analysis: OrigamiQueryAnalysis<S> \| null` (default `null`), `disabled` (default `false`); `(search)`, `(caretChange)`; exposes `state` |
| `ogQueryFieldInput`      | `id` (default generated); on the one `<input>`                                                                                                                       |
| `ogQueryFieldContent`    | `id`, `side` (`block-end`), `align` (`start`), `gap` (`0`); the list; exposes the composed Popover Content's `state`                                                 |
| `ogQueryFieldSuggestion` | `suggestion: S` (required), `id` (default generated); a row, inside Content                                                                                          |
| `ogQueryFieldMessage`    | `id` (default generated); the caret token's message, inside Content                                                                                                  |
| `ogQueryFieldErrors`     | `id` (default generated); the hidden element holding every token error, which the input's description names                                                          |

```ts
import { Component, computed, resource, signal } from "@angular/core";
import {
  OrigamiQueryField,
  OrigamiQueryFieldInput,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldSuggestion,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldErrors,
} from "@loozo/origami-ui/query-field";
import type { OrigamiQueryAnalysis, OrigamiQueryRange } from "@loozo/origami-ui/query-field";
import { parseReportQuery, type ReportSuggestion } from "./report-query"; // your parser
import { lookupUsers } from "./users";

interface UserReply {
  readonly query: string;
  readonly caret: number;
  readonly items: readonly ReportSuggestion[];
}

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
      class="search"
      [(query)]="query"
      (caretChange)="caret.set($event)"
      [analysis]="analysis()"
      (search)="run($event)"
    >
      <div class="marks" aria-hidden="true" [hidden]="qf.state.composing()">
        <div [style.translate.px]="-qf.state.scrollLeft()">
          @for (segment of qf.state.segments(); track segment.start) {
            <span
              [attr.data-part]="segment.part"
              [attr.data-invalid]="segment.token?.error ? '' : null"
              >{{ segment.text }}</span
            >
          }
        </div>
      </div>
      <input ogQueryFieldInput aria-label="Search reports" />
      <div ogQueryFieldContent class="list">
        @if (qf.state.caretToken()?.error; as error) {
          <p ogQueryFieldMessage>{{ error }}</p>
        }
        @for (suggestion of qf.state.suggestions(); track $index) {
          <div ogQueryFieldSuggestion [suggestion]="suggestion">
            {{ suggestion.label }} <small>{{ suggestion.detail }}</small>
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
  `,
})
export class ReportSearch {
  readonly query = signal("report by:al");
  readonly caret = signal<number | null>(null);
  readonly #parsed = computed(() => parseReportQuery(this.query()));

  // A caret you still hold past the end, just after a shorter query was written, isn't one.
  readonly #caret = computed(() => {
    const caret = this.caret();

    if (caret === null || caret > this.query().length) {
      return null;
    }

    return caret;
  });

  // resource() aborts the previous load when params change, so a superseded reply never lands.
  readonly #users = resource({
    params: () => {
      const caret = this.#caret();

      if (caret === null) {
        return undefined;
      }

      const range: OrigamiQueryRange | null = this.#parsed().userValueAt(caret);

      if (range === null) {
        return undefined;
      }

      return { query: this.query(), caret, range };
    },
    loader: async ({ params, abortSignal }): Promise<UserReply> => {
      const { query, caret, range } = params;

      try {
        const items = await lookupUsers(query, range, abortSignal); // items carry range.start/end
        return { query, caret, items };
      } catch (error) {
        if (abortSignal.aborted) {
          throw error; // superseded: resource drops it
        }

        return { query, caret, items: [] }; // failed: settles as "no suggestions"; show your own error
      }
    },
  });

  readonly analysis = computed((): OrigamiQueryAnalysis<ReportSuggestion> => {
    const query = this.query();
    const caret = this.#caret();
    const parsed = this.#parsed();
    const completion = parsed.completionAt(caret); // { rows } | "users" | null
    let suggestions: readonly ReportSuggestion[] | null = [];

    if (completion === "users") {
      suggestions = null; // loading until a reply stamped for this query and caret

      if (this.#users.hasValue()) {
        const reply = this.#users.value();

        if (reply.query === query && reply.caret === caret) {
          suggestions = reply.items;
        }
      }
    } else if (completion !== null) {
      suggestions = completion.rows;
    }

    return { query, caret, tokens: parsed.tokens, suggestions };
  });

  run(query: string): void {
    /* navigate with ?q=query */
  }
}
```

Put the rows and the Message inside `ogQueryFieldContent`: there they belong to the list, and outside it they throw. Keep `[hidden]` `display: none` in your CSS: rows whose suggestion isn't current and the Message while the caret's token is valid carry `hidden`.

## The analysis

`[analysis]` is your analysis of one query at one caret, stamped with the query and caret its offsets refer to. Offsets are UTF-16 code units, as `selectionStart` counts them, and ranges are half-open `[start, end)`.

```ts
// `report staus:open by:@me` with the caret after `staus` (offset 12)
{
  query: "report staus:open by:@me",
  caret: 12,
  tokens: [
    { start: 0, end: 6 },                                                   // report (free text)
    { start: 7, end: 17, qualifier: { start: 7, end: 12 }, error: "Unknown filter “staus”" },
    { start: 18, end: 24, qualifier: { start: 18, end: 20 } },             // by:@me
  ],
  suggestions: [
    { start: 7, end: 12, insert: "status", label: "status", detail: "Status" },
    { start: 7, end: 12, insert: "sort", label: "sort", detail: "Sort" },
  ],
}
```

- **Tokens** are non-empty, in order and don't overlap; touching is fine. A qualifier starts at its token's start and doesn't include its separator. `error` is a non-empty message while the token is invalid.
- **Suggestions** are for the token at the caret: picking one replaces `[start, end)` with `insert`. The range may be empty, an insertion. `[]` means none, `null` loading. Origami reads only `start`, `end` and `insert`: show what you like, such as a Greek label that inserts an ASCII key (`κατάσταση` inserting `status:`); the mapping is yours. Extend `OrigamiQuerySuggestion` with your own fields; `state.suggestions()` returns your type, inferred from `[analysis]`.
- **Shapes** that can't be applied throw a `RangeError` naming the field when the analysis is read: a non-integer offset, a range reversed or outside its own `query`, an empty or overlapping token, a qualifier that doesn't start at its token's start, is empty or ends past it, an empty `error`, a `caret` outside its `query`, a line break in `query` or an `insert`. A `query` you write with a line break throws too: a single-line input strips them, so sanitize a query from the URL.

**Applicability.** Your tokens apply while the analysis's `query` is the query; your suggestions while, in addition, its `caret` is the input's caret and no composition is open. Otherwise `state.tokens()` is `[]`, `state.segments()` one unmarked run, and `state.suggestions()` `[]`. So a stale analysis can never misplace a mark or edit the wrong range; it shows nothing until a current one arrives.

**Freshness is yours.** Parse synchronously, so marks and `aria-invalid` follow every keystroke, and load only suggestions asynchronously. Drop superseded requests (`resource()`, `switchMap`, or an `AbortController` cleaned up in an effect) and never restamp a list computed for another caret: two analyses with the same stamp are indistinguishable, and the last one bound wins. Settle a failed lookup as `[]` with its stamp; left `null`, the list stays pending until the next edit or caret move.

**The caret is a native observation.** `caretChange` follows the input; after you write a shorter query from outside it can be briefly greater than the new query's length, until the input reports the caret at its new end. Publish `caret: null` while the caret you hold is past the query's end, before computing completions or starting a lookup, as the example does. Writing `query` from outside can start one extra lookup with the previous caret, which `resource()` aborts when `caretChange` follows.

**Segments** split the current query for drawing marks: for each token, the gap before it (`text`), its qualifier (`qualifier`) and the rest of it, separator included (`value`), then the tail (`text`). `state.caretToken()` is the token at the caret; where one token ends at the caret and the next starts there, the invalid one wins, else the one starting at the caret.

## Editing and events

The input owns its text, selection, scroll and undo history, so it must support selection: `type="text"` (the default) or `type="search"`, not `email` or another type without `setSelectionRange`. `[(query)]` updates on every edit, synchronously in its `input` event, then `caretChange` reports the caret, so a `computed` of both sees them together; a side effect in `(queryChange)` sees the old caret. A `(queryChange)` or `(caretChange)` handler that moves focus away ends the edit or key there: the blur's null caret and closed list stand. The key changes nothing after the blur, so whatever the handler did stands, but it still settles its own event: Enter is consumed after a highlight and otherwise still searches, unless the handler replaced the Input; it never picks. Its `value` attribute is the query until its first render, so the server renders it; after that, a query you write from outside shows in the input after the next render (when it differs from the text, outside a composition), moves a focused input's caret to its end and closes the list. To normalize edits, write the root's own `query` from `(queryChange)` (`#qf="ogQueryField"`, `qf.query.set(…)`), or use replaced Options: a two-way binding re-applies only a changed expression, so writing your bound signal back to the value it held before the edit (lower-casing an `R` typed over an `r`) wouldn't reach the input. That write replaces the browser's undo history in at least Chromium. A native form reset restores the first query without an `input` event, so `query` lags until the next edit; a search field isn't a form control.

`(search)` emits the query on Enter while no suggestion is highlighted, the list open or closed, also with invalid tokens; the key keeps its default, so a surrounding form submits too (wiring both runs twice). The one exception: the Enter right after a highlight you saw lapsed does nothing (below). `(caretChange)` emits null on blur, for a range selection and when the input goes away.

## The list

The list opens when you edit, on ArrowDown, ArrowUp or Alt+ArrowDown while there are current suggestions, and when the caret moves into another invalid token, by an arrow key or a click from outside; never on focus alone (Tab, script or a Label). It shows your current rows and, while the caret's token is invalid, your Message above them. While suggestions load it shows nothing, unless the caret's token is invalid; a settled empty list closes, except for an invalid token, which keeps waiting for its Message. Without an `ogQueryFieldMessage`, an invalid token with no suggestions shows no popup; its error is still in the input's description.

| Key                           | Closed                                                                 | Open with rows                            | Open with the message only |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | -------------------------- |
| ArrowDown / ArrowUp           | opens on the first / last row while there are suggestions; else native | next / previous row, no wrapping          | native                     |
| Alt+ArrowDown                 | opens with nothing highlighted                                         | —                                         | —                          |
| Alt+ArrowUp                   | —                                                                      | closes                                    | closes                     |
| PageDown / PageUp             | native                                                                 | ten rows                                  | native                     |
| Shift+an arrow or page key    | native selection                                                       | native selection                          | native selection           |
| Home, End, Left, Right, Space | native                                                                 | native; the rows follow the caret         | native                     |
| Enter                         | `search`, or nothing once after a lapse                                | picks the highlighted row, else as Closed | as Closed                  |
| Escape                        | native                                                                 | closes; text, focus and caret stay        | closes                     |
| Tab                           | native                                                                 | closes; focus moves                       | closes; focus moves        |

Focus stays in the input: the highlighted row is its `aria-activedescendant`. Moving the caret retires the highlight. A highlight you saw that stops applying because of the data or the caret, because the caret moved, a reply replaced its row or settled to no suggestions (closing the list), or your analysis went stale or started loading, lapses: the next Enter does nothing rather than search, once, and any other key ends that. Dismissing on purpose clears a lapse: Escape, Tab, a pick, an edit, a click outside that closes the list or withdraws one still waiting (on a focus-keeping surface too), blur, a query written from outside, disabling and replacing the input. A press outside that doesn't close the list, because it was cancelled or released over the input, keeps the highlight, so Enter still picks. A highlight ArrowDown set in the moment before the list showed was never seen, so Enter then searches. Hovering a row highlights it; clicking picks what it showed when you pressed it, with the same input; a press that's cancelled or released off the row picks nothing. Escape, Tab, a click outside or blur close the list; a list still waiting for suggestions also closes on a press on a focus-keeping surface. Inside a Dialog, Escape closes only an open list; while the list waits for suggestions it withdraws the request and still closes the Dialog; in the moment before the list shows, it withdraws it and stops there. Keys are ignored with Ctrl or Meta, during a composition and while disabled.

The list is a native top-layer Popover anchored to the input: use `gap` for spacing, `--og-anchor-width` and `--og-available-height` for sizing, and scope a custom `display` to `:popover-open`. Keyboard moves scroll its nearest scrolling box, never the page.

## Picks and undo

A pick replaces exactly the suggestion's range with its `insert` through `document.execCommand("insertText")`, so it's one step in the browser's undo history, and the input reports it as an ordinary edit (`queryChange`, then `caretChange`) before the pick returns. The caret lands after the insert and is scrolled into view. It applies only while the input is focused, enabled and writable, its text is the analysis's query and its caret the analysis's caret, and the suggestion is still current; otherwise nothing happens. A suggestion whose insert equals the text in its range moves the caret to its end without an edit. If the browser's insertion edits nothing, the selection is put back and the list stays. After a pick the list stays open if the new caret has suggestions, and closes otherwise.

A pick isn't promised to dispatch `beforeinput`: Chromium and Firefox dispatched none for this insertion. To refuse a suggestion, don't offer it. `maxlength` isn't supported.

## Input methods

During an IME composition nothing is written or read: `query` and the caret wait, no key is handled, no pick happens and the list hides, as `state.composing()` tells your mark layer to. When it ends, changed text is one edit, which wins over a query you wrote meanwhile; a cancelled composition is no edit, and your write shows then.

## Descriptions, Field and screen readers

`aria-invalid="true"` is on the input while a current token is invalid, overwriting a template value; render every error in the hidden `ogQueryFieldErrors`, which the input's `aria-describedby` names meanwhile. Each row is described by the Message while the caret's token is invalid, so arrowing to a fix reads why. A message with no fixes isn't a listbox: the popup is `aria-hidden`, `aria-expanded` stays `"false"`, and the message is in the input's description on demand. There's no live announcement.

Inside an [`ogField`](../field/README.md) the Field's Label names the input, and its description is the Field's Descriptions, its mounted Errors, then the token errors. Token errors don't invalidate a form, and a Field Error doesn't set `aria-invalid`; `aria-required` stays as you write it. Outside a Field, name the input with `aria-label` or `aria-labelledby`; a static `aria-describedby` is replaced while a token is invalid, so put a hint in a Field Description instead.

## Server rendering and hydration

The server renders the input's query, its ARIA, your marks and errors, and a closed list. Hydration keeps the nodes and IDs. Text typed before the input hydrates becomes the query once, without opening the list, and the caret is read at once, so the first ArrowDown after hydration has suggestions. Keep the input, Content and Errors in one hydrate boundary: while Content is still dehydrated the list can't open and `aria-controls` is absent, and while the Errors are, the input keeps naming the server's Errors element, with its server text, even if the query became valid meanwhile. Once they hydrate, the input keeps naming that element while no error applies, and its text follows your tokens: empty while the query is valid.

## Sizing and marks

Give the mark layer the input's font, padding and border, `white-space: pre` and transparent text, translate it by `-state.scrollLeft()`, and hide it while `state.composing()`. Mark spans shouldn't change metrics (no padding, weight or font change). Right-to-left and vertical writing modes aren't supported.

Shadow DOM and iframes aren't supported.

## Not included

An `open` model, a readonly option, a pick output or veto, caret placement inside the insert, opening on focus, Tab completion, a clear button, multi-line queries, chips, built-in parsing or filtering, saved searches, Signal Forms binding, live announcements and a loading row.

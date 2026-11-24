import {
  DestroyRef,
  Service,
  afterRenderEffect,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from "@angular/core";
import type { Signal, WritableSignal } from "@angular/core";
import { ɵOrigamiListbox, ɵmoveActiveOption } from "@loozo/origami-ui/collection";
import type { ɵActiveOptionMove, ɵOrigamiListboxOption } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";
import { sameRange, segmentsOf, tokenAt, validateAnalysis, validateQuery } from "./query-analysis";
import type {
  OrigamiQueryAnalysis,
  OrigamiQuerySegment,
  OrigamiQuerySuggestion,
  OrigamiQueryToken,
} from "./query-analysis";
import { OrigamiQueryFieldOptions } from "./query-field-options";

/** What a Suggestion registers through its Content from its `ngOnInit`. */
export interface QueryFieldSuggestionRegistration extends ɵOrigamiListboxOption {
  /** The suggestion the row shows, from its effective Options. */
  readonly suggestion: Signal<OrigamiQuerySuggestion>;
}

/** What Content registers from its `ngOnInit`. */
export interface QueryFieldContentRegistration {
  readonly element: HTMLElement;
  /** Its effective ID, which the input's `aria-controls` names. */
  readonly id: Signal<string>;
  /** Its composed Popover's native participation, as last synchronized. */
  readonly participating: Signal<boolean>;
  /** Synchronizes its composed Popover, then reads its participation: for decisions at an event. */
  readonly isParticipating: () => boolean;
}

/** What the Message and the Errors register: their effective IDs. */
export interface QueryFieldIdRegistration {
  readonly id: Signal<string>;
}

/** What the Input registers from its `ngOnInit`. */
export interface QueryFieldInputRegistration {
  readonly element: HTMLInputElement;
  /** Its Field's Label IDs while it is the Field's control, else its static `aria-labelledby`. */
  readonly labelledBy: Signal<string | null>;
  /** Its template's static `aria-label`, or null. */
  readonly label: string | null;
  /** Applies a pick that passed activation, under the Input's live guards. */
  readonly pick: (suggestion: OrigamiQuerySuggestion, analysis: OrigamiQueryAnalysis) => void;
}

/**
 * Why the caret was read: `edit` in an `input` event, `write` after the reconcile wrote the
 * query, `pick` after an equal-text pick, `baseline` at a focus that wasn't pointer-started, at
 * attach and at a composition's end, and `move` for every other change. Only `move` is a caret
 * movement.
 */
export type QueryFieldCaretCause = "edit" | "write" | "pick" | "baseline" | "move";

/** The row a key, an opening or the pointer highlighted, with the suggestion it showed then. */
interface Highlight {
  readonly row: QueryFieldSuggestionRegistration;
  readonly suggestion: OrigamiQuerySuggestion;
  /** It was the effective highlight at some point: the user saw it. One prepared while Opening isn't, yet. */
  exposed: boolean;
}

/**
 * The request at an event, actual participation first (plan-4 R3-F04): Shown while the Popover
 * participates, `lapsed` when the synchronizing read at the event withdrew that participation,
 * else Opening (presentable, not yet participating), Pending (not presentable) or Closed.
 */
export type QueryFieldPresentation = "closed" | "pending" | "opening" | "shown" | "lapsed";

/**
 * @internal The query field's private owner: the query and analysis it reads from the root's
 * Options, the caret, composition and scroll the Input feeds it, the request (the composed
 * Popover's `open`), the registrations its parts make, the shared listbox core for the rows and
 * the highlight snapshot every key and pointer action reads.
 */
@Service({ autoProvided: false })
export class QueryFieldContext {
  readonly #options = injectDeferred(OrigamiQueryFieldOptions);
  readonly #caretChanges = new Subject<number | null>();
  readonly #searches = new Subject<string>();
  readonly #caret = signal<number | null>(null);
  readonly #composing = signal(false);
  readonly #scrollLeft = signal(0);
  readonly #content = signal<QueryFieldContentRegistration | null>(null);
  readonly #input = signal<QueryFieldInputRegistration | null>(null);
  readonly #message = signal<QueryFieldIdRegistration | null>(null);
  readonly #errors = signal<QueryFieldIdRegistration | null>(null);
  readonly #snapshot = signal<Highlight | null>(null);
  #destroyed = false;
  /**
   * The one-shot Enter guard: a highlight the user saw lost its eligibility since the last key.
   * Two transitions own it: `#lapse()` (eligibility loss: a caret movement, its row replaced, a
   * settled `[]`, the analysis stale or loading, presentation suppressed) arms it, and `#reset()`
   * (an intentional reset: Escape, Tab, a pick, an edit, blur, detach, an outside press that
   * withdraws a request that isn't Shown, the Popover's committed dismissal of a Shown list, an
   * outside write, disabling) clears it. The next key ends it; only Enter acts on it.
   */
  #lapsed = false;
  /** The Input interaction: a new one starts at each Input registration and detach. */
  #interaction = 0;
  /**
   * Counts blurs and detaches. A synchronous subscriber that moved focus away while it was
   * notified ended the transition that notified it: that transition stops there.
   */
  #blurs = 0;

  /** The requested state: Closed, or Pending, Opening or Shown. */
  readonly requested = signal(false);
  /**
   * The composed Popover's `open`: it reads the request, and the Popover's own write, its
   * committed outside or Escape dismissal of a Shown list, resets the interaction before it
   * clears the request.
   */
  readonly popoverOpen: WritableSignal<boolean> = linkedSignal(() => this.requested(), {
    // Every change reaches the Popover, also a close and a reopen before it reads, as Menu's
    // bridge does: its intent is a new decision for each, so an earlier gesture can't close it.
    equal: () => false,
    set: (open) => {
      if (!open) {
        this.#reset();
      }

      this.requested.set(open);
    },
  });

  /** The effective query; a line break throws `RangeError`. */
  readonly query = computed(() => {
    const query = this.#options().query();

    validateQuery(query);

    return query;
  });
  readonly disabled = computed(() => this.#options().disabled());
  /** The bound analysis, validated; null without one. */
  readonly analysis = computed(() => {
    const analysis = this.#options().analysis();

    if (analysis !== null) {
      validateAnalysis(analysis);
    }

    return analysis;
  });
  /** The focused, attached Input's collapsed caret; held during a composition; else null. */
  readonly caret = this.#caret.asReadonly();
  readonly composing = this.#composing.asReadonly();
  readonly scrollLeft = this.#scrollLeft.asReadonly();
  readonly caretChanges = this.#caretChanges.asObservable();
  readonly searches = this.#searches.asObservable();

  /** Current tokens: the analysis's while it was computed for the query, else none. */
  readonly tokens = computed<readonly OrigamiQueryToken[]>(() => {
    const analysis = this.analysis();

    if (analysis === null || analysis.query !== this.query()) {
      return [];
    }

    return analysis.tokens;
  });
  /** Whether the analysis's suggestions apply: its query and caret are the live ones, no composition. */
  readonly #suggestionsApply = computed(() => {
    const analysis = this.analysis();
    const caret = this.#caret();

    return (
      analysis !== null &&
      analysis.query === this.query() &&
      caret !== null &&
      analysis.caret === caret &&
      !this.#composing()
    );
  });
  /** Current suggestions, `[]` while none apply or they're loading. */
  readonly suggestions = computed<readonly OrigamiQuerySuggestion[]>(() => {
    const suggestions = this.analysis()?.suggestions ?? null;

    if (!this.#suggestionsApply() || suggestions === null) {
      return [];
    }

    return suggestions;
  });
  /** Whether the current suggestions are settled: they apply and aren't loading. */
  readonly #settled = computed(
    () => this.#suggestionsApply() && (this.analysis()?.suggestions ?? null) !== null,
  );
  /** Known empty: settled `[]` for a caret token that isn't invalid, which closes the request. */
  readonly #knownEmpty = computed(
    () =>
      this.#settled() && this.suggestions().length === 0 && this.caretToken()?.error === undefined,
  );
  readonly segments = computed<readonly OrigamiQuerySegment[]>(() =>
    segmentsOf(this.query(), this.tokens()),
  );
  readonly caretToken = computed(() => tokenAt(this.tokens(), this.#caret()));
  readonly invalid = computed(() => {
    for (const token of this.tokens()) {
      if (token.error !== undefined) {
        return true;
      }
    }

    return false;
  });

  /** The registered Content's participation; false without Content. */
  readonly participating = computed(() => this.#content()?.participating() ?? false);
  /** Shown: requested and actually presented. */
  readonly shown = computed(() => this.requested() && this.participating());
  readonly #listbox = new ɵOrigamiListbox<QueryFieldSuggestionRegistration>(this.shown);
  /** The number of registered rows of the registered Content that show a current suggestion. */
  readonly #rowCount = computed(() => {
    if (this.#content() === null) {
      return 0;
    }

    let count = 0;

    for (const row of this.#listbox.options()) {
      if (this.current(row.suggestion())) {
        count += 1;
      }
    }

    return count;
  });
  /** Whether registered Content has current rows: Content's `aria-hidden` is absent only then. */
  readonly hasCurrentRows = computed(() => this.#rowCount() > 0);
  /** Whether the registered Content's Message shows: it's registered and the caret token is invalid. */
  readonly message = computed(
    () =>
      this.#content() !== null &&
      this.#message() !== null &&
      this.caretToken()?.error !== undefined,
  );
  /** The one presentation gate: Content, a caret, no composition, and current rows or the Message. */
  readonly presentable = computed(
    () =>
      this.#content() !== null &&
      this.#caret() !== null &&
      !this.#composing() &&
      (this.#rowCount() > 0 || this.message()),
  );
  /**
   * The gate as the last completed render left it. Within one refresh the root's view sees a new
   * analysis before its rows' embedded views show the new suggestions, so the live gate can read
   * false for one pass while nothing changed for the user; the Popover reads this one instead, so
   * that pass doesn't hide and show the list again.
   */
  readonly #renderedGate = signal(false);
  /** The composed Popover's input owner: the Input while presentable, else null, which suppresses it. */
  readonly ownerInput = computed(() => {
    if (!this.#renderedGate()) {
      return null;
    }

    return this.#input()?.element ?? null;
  });
  /** Whether the list is Shown with current rows: the input's `aria-expanded`. */
  readonly expanded = computed(() => this.shown() && this.hasCurrentRows());
  /** The effective highlight: the snapshot while its row still shows that suggestion, current, and the list is Shown. */
  readonly highlighted = computed(() => {
    const snapshot = this.#snapshot();

    if (
      snapshot === null ||
      !this.shown() ||
      !this.#listbox.options().includes(snapshot.row) ||
      snapshot.row.suggestion() !== snapshot.suggestion ||
      !this.current(snapshot.suggestion)
    ) {
      return null;
    }

    return snapshot.row;
  });
  readonly activeDescendant = computed(() => this.highlighted()?.id() ?? null);
  readonly contentId = computed(() => this.#content()?.id() ?? null);
  readonly messageId = computed(() => this.#message()?.id() ?? null);
  readonly errorsId = computed(() => this.#errors()?.id() ?? null);
  /** The registered Input's `aria-labelledby`, for Content's name. */
  readonly labelledBy = computed(() => this.#input()?.labelledBy() ?? null);
  /** The registered Input's static `aria-label`, for Content's name. */
  readonly inputLabel = computed(() => this.#input()?.label ?? null);
  /** The registered Input's element, for the root's `focus()`. */
  readonly inputElement = computed(() => this.#input()?.element ?? null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });

    // Known empty: settled `[]` for a caret token that isn't invalid closes the request. An invalid
    // caret token keeps it until a Message registers, or it's dismissed. The reply replaced the
    // rows, so a highlight the user saw lapses, whichever of this and the highlight effect runs
    // first.
    effect(() => {
      if (this.requested() && this.#knownEmpty()) {
        untracked(() => {
          this.#lapse();
          this.requested.set(false);
        });
      }
    });

    // Disabling resets the interaction and clears the request; enabling doesn't restore it.
    effect(() => {
      if (this.disabled()) {
        untracked(() => {
          this.#reset();
          this.requested.set(false);
        });
      }
    });

    afterRenderEffect({
      write: () => {
        this.#renderedGate.set(this.presentable());
      },
    });

    // The effective highlight marks its snapshot as seen. When it stops being effective while the
    // request stays (rows replaced, the analysis stale or loading, presentation suppressed), that's
    // an eligibility loss. A request cleared by an intentional reset already retired the snapshot;
    // known empty lapsed it in its own effect.
    effect(() => {
      const row = this.highlighted();
      const requested = this.requested();

      untracked(() => this.#follow(row, requested));
    });
  }

  /** Whether `suggestion` is one of the current suggestions, by identity. */
  current(suggestion: OrigamiQuerySuggestion): boolean {
    return this.suggestions().includes(suggestion);
  }

  /** Registers the Input from its `ngOnInit`; its composed Popover Anchor rejects a second one first. */
  registerInput(input: QueryFieldInputRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#input.set(input);
    this.#interaction += 1;
    destroyRef.onDestroy(() => {
      if (this.#input() !== input) {
        return;
      }

      this.#input.set(null);
      this.#detached();
    });
  }

  /** Registers Content from its `ngOnInit`; its composed Popover Content rejects a second one first. */
  registerContent(content: QueryFieldContentRegistration, destroyRef: DestroyRef): void {
    this.#registerOne(this.#content, content, destroyRef, "Content");
  }

  /** Registers the Message through its Content; a second mounted one fails. */
  registerMessage(message: QueryFieldIdRegistration, destroyRef: DestroyRef): void {
    this.#registerOne(this.#message, message, destroyRef, "Message");
  }

  /** Registers the Errors from its `ngOnInit`; a second mounted one fails. */
  registerErrors(errors: QueryFieldIdRegistration, destroyRef: DestroyRef): void {
    this.#registerOne(this.#errors, errors, destroyRef, "Errors");
  }

  /** Registers a Suggestion row through its Content, unless its view is already destroyed. */
  registerSuggestion(row: QueryFieldSuggestionRegistration, destroyRef: DestroyRef): void {
    this.#listbox.register(row, destroyRef);
  }

  /** Scrolls each keyboard highlight into view inside Content; Content calls it once. */
  scrollReveals(content: HTMLElement, ready: () => boolean): void {
    this.#listbox.scrollReveals(content, ready);
  }

  /** Focuses the registered Input; nothing while none is registered. */
  focus(options?: FocusOptions): void {
    this.inputElement()?.focus(options);
  }

  /**
   * The user edited the text, in the `input` event: it becomes the query, the highlight retires,
   * the list is requested unless disabled, then the caret is read. A `queryChange` subscriber that
   * moved focus away ends the edit's transition at its blur.
   */
  edited(text: string, caret: number | null): void {
    if (this.#destroyed) {
      return;
    }

    const blurs = this.#blurs;

    this.#options().query.set(text);

    if (this.#blurs !== blurs) {
      return;
    }

    this.#reset();

    if (!this.disabled()) {
      this.requested.set(true);
    }

    this.caretRead(caret, "edit");
  }

  /** Text typed into the server's input before hydration becomes the query, without opening. */
  adopt(text: string): void {
    if (!this.#destroyed) {
      this.#options().query.set(text);
    }
  }

  /**
   * The reconcile wrote a query from outside into the input: the request clears, the highlight
   * retires and a focused input's caret, now at the end, is read.
   * @param caret - The caret after the write, or null while the input isn't focused.
   */
  written(caret: number | null): void {
    if (this.#destroyed) {
      return;
    }

    this.requested.set(false);
    this.#reset();
    this.caretRead(caret, "write");
  }

  /**
   * A caret read: a movement lapses a highlight the user saw, whether or not it's still effective,
   * any other cause resets it. A movement into another invalid token requests the list, and any
   * other movement clears a request that isn't Shown. The transition completes before a changed
   * caret emits `caretChange`, so a subscriber that moves focus leaves its blur the last word.
   * @param origin - Where a movement started, when that isn't the caret: the selection a focus
   *   restored before a movement in its task, which was never published.
   */
  caretRead(
    caret: number | null,
    cause: QueryFieldCaretCause,
    origin: number | null = untracked(this.#caret),
  ): void {
    const previous = untracked(this.#caret);

    if (this.#destroyed || caret === previous) {
      return;
    }

    this.#caret.set(caret);

    if (cause === "move") {
      this.#lapse();
      this.#moved(caret, origin);
    } else {
      this.#reset();
    }

    this.#caretChanges.next(caret);
  }

  /** A composition started: it holds the caret and suppresses presentation until it ends. */
  compositionStarted(): void {
    if (!this.#destroyed) {
      this.#composing.set(true);
      this.#reset();
    }
  }

  /** A composition ended; the Input then reports its edit, if any, and resamples the caret. */
  compositionEnded(): void {
    if (!this.#destroyed) {
      this.#composing.set(false);
    }
  }

  /** The Input scrolled horizontally. */
  scrolled(left: number): void {
    if (!this.#destroyed) {
      this.#scrollLeft.set(left);
    }
  }

  /**
   * A key's live caret differed from the caret: it's a movement, whose lapse belongs to this key
   * and doesn't carry to the next one. A `caretChange` subscriber that moved focus away leaves the
   * state its blur and any later interaction made.
   */
  resampled(caret: number | null): void {
    const blurs = this.#blurs;

    this.caretRead(caret, "move");

    if (this.#blurs === blurs) {
      this.#lapsed = false;
    }
  }

  /** Focus left the Input: the caret is null, the request clears and nothing lapses. */
  blurred(): void {
    if (this.#destroyed) {
      return;
    }

    this.#blurs += 1;
    this.caretRead(null, "baseline");
    this.requested.set(false);
    this.#reset();
  }

  /**
   * A key reached the Input: returns whether a highlight was presented, or lapsed since the last
   * key, which the next Enter consumes, and ends that window. A highlight prepared while Opening
   * and never shown doesn't count. A seen highlight that already stopped being effective retires
   * here, so the highlight effect can't arm the guard from it after this key.
   */
  keyArrived(): boolean {
    const snapshot = this.#snapshot();
    const highlighted = this.highlighted();
    let presented = false;

    if (snapshot !== null && this.requested()) {
      presented = snapshot.exposed || highlighted !== null;
    }

    const had = presented || this.#lapsed;

    this.#lapsed = false;

    if (snapshot?.exposed === true && highlighted === null) {
      this.#retire();
    }

    return had;
  }

  /** The request at this event, actual participation first, for a dismissing key. */
  presentation(): QueryFieldPresentation {
    if (!this.requested()) {
      return "closed";
    }

    if (this.participating()) {
      if (this.#content()?.isParticipating() ?? false) {
        return "shown";
      }

      return "lapsed";
    }

    if (this.presentable()) {
      return "opening";
    }

    return "pending";
  }

  /**
   * Escape, after the key's caret resample settled any movement: Shown (as classified before the
   * resample) is the Popover layer's, which closes the list. A list whose participation lapsed at
   * this event, and Opening, are cleared here and consume the key, so it never reaches an
   * enclosing layer; Pending and Closed clear any request, the resample's included, and leave the
   * key to an enclosing layer.
   */
  escape(event: KeyboardEvent, presentation: QueryFieldPresentation): void {
    this.#reset();

    if (presentation === "shown") {
      return;
    }

    if (presentation === "lapsed" || presentation === "opening") {
      event.preventDefault();
    }

    this.requested.set(false);
  }

  /**
   * A primary press outside the input and Content withdraws a request that isn't Shown, which
   * resets the interaction. Shown is the Popover layer's: its committed outside dismissal resets
   * through `popoverOpen`, and a gesture it rejects (cancelled, or ending inside) keeps the
   * highlight.
   */
  pressedOutside(path: readonly EventTarget[]): void {
    if (!this.requested() || this.participating()) {
      return;
    }

    const input = this.#input()?.element ?? null;
    const content = this.#content()?.element ?? null;

    for (const target of path) {
      if (target === input || target === content) {
        return;
      }
    }

    this.#reset();
    this.requested.set(false);
  }

  /** Closes the list: Tab, Alt+ArrowUp. */
  close(): void {
    this.#reset();
    this.requested.set(false);
  }

  /** Current rows in DOM order at the event. */
  #rows(): QueryFieldSuggestionRegistration[] {
    const rows: QueryFieldSuggestionRegistration[] = [];

    if (this.#content() === null) {
      return rows;
    }

    for (const row of this.#listbox.ordered()) {
      if (this.current(row.suggestion())) {
        rows.push(row);
      }
    }

    return rows;
  }

  /** Whether current rows exist, at the event, by cached membership. */
  hasRows(): boolean {
    return this.#rowCount() > 0;
  }

  /** The current Input interaction, which a row's press binds to. */
  interaction(): number {
    return this.#interaction;
  }

  /**
   * An opening key with current rows: requests the list and highlights the first or last row,
   * or none; the highlight shows once the list is Shown.
   */
  openAt(target: "first" | "last" | "none"): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    this.requested.set(true);

    if (target === "none") {
      this.#reset();

      return;
    }

    this.#highlight(ɵmoveActiveOption(this.#rows(), null, target));
  }

  /** A key in a Shown list moves the highlight from the effective one over current rows. */
  move(move: ɵActiveOptionMove): void {
    this.#highlight(ɵmoveActiveOption(this.#rows(), this.highlighted(), move));
  }

  /** The pointer moved over a row of a Shown list: it becomes highlighted, without scrolling. */
  point(row: QueryFieldSuggestionRegistration): void {
    if (this.#destroyed || !this.shown() || !this.current(row.suggestion())) {
      return;
    }

    if (this.highlighted() === row) {
      return;
    }

    this.#snapshot.set({ row, suggestion: row.suggestion(), exposed: true });
    this.#listbox.point(row);
  }

  /**
   * Enter, after the caret resample: picks the effective highlight; else consumes the key when a
   * highlight was presented or lapsed since the last key; else emits `search` and closes,
   * leaving the default (a form submits).
   * @param had - Whether a highlight was presented or lapsed when the key arrived, before the resample.
   */
  enter(event: KeyboardEvent, had: boolean): void {
    const highlighted = this.highlighted();
    const snapshot = this.#snapshot();

    if (highlighted !== null && snapshot !== null) {
      event.preventDefault();
      this.pick(highlighted, snapshot.suggestion);

      return;
    }

    if (had) {
      event.preventDefault();
      this.#reset();

      return;
    }

    this.search();
    this.requested.set(false);
  }

  /**
   * Reads the root's own query signal, which a write back to the value it held still changes, so
   * a reader reruns on every write; `query` settles to equal values and doesn't.
   */
  queryWritten(): string {
    return this.#options().query();
  }

  /** Emits `search` with the effective query. */
  search(): void {
    this.#searches.next(this.query());
  }

  /** The blur and detach count: a key compares it to tell whether a subscriber moved focus away. */
  blurs(): number {
    return this.#blurs;
  }

  /**
   * A click on a row that recorded its press: picks the suggestion the row showed at the press,
   * only in the Input interaction the press started in, while the row still shows it, is a current
   * row and the list is Shown.
   */
  clicked(
    row: QueryFieldSuggestionRegistration,
    pressed: OrigamiQuerySuggestion,
    interaction: number,
  ): void {
    if (
      this.#destroyed ||
      interaction !== this.#interaction ||
      !this.shown() ||
      row.suggestion() !== pressed ||
      this.#content() === null ||
      !this.#listbox.options().includes(row) ||
      !this.current(pressed)
    ) {
      return;
    }

    this.pick(row, pressed);
  }

  /** Applies `suggestion` through the Input, which checks its live guards. */
  pick(row: QueryFieldSuggestionRegistration, suggestion: OrigamiQuerySuggestion): void {
    const input = this.#input();
    const analysis = this.analysis();

    if (
      this.#destroyed ||
      input === null ||
      analysis === null ||
      row.suggestion() !== suggestion ||
      !this.current(suggestion)
    ) {
      return;
    }

    input.pick(suggestion, analysis);
  }

  /** An equal-text or completed pick resets the interaction. */
  picked(): void {
    this.#reset();
  }

  /** A row became the highlight; in a Shown list it's effective at once, so it counts as seen. */
  #highlight(row: QueryFieldSuggestionRegistration | null): void {
    if (row === null) {
      return;
    }

    this.#snapshot.set({ row, suggestion: row.suggestion(), exposed: this.shown() });
    this.#listbox.activate(row);
  }

  /**
   * After the effective highlight or the request changed: an effective highlight marks its
   * snapshot seen; a seen one that stopped being effective while the request stays lost its
   * eligibility; one prepared while Opening waits for the list to show. With the request cleared,
   * a snapshot left over just retires.
   */
  #follow(row: QueryFieldSuggestionRegistration | null, requested: boolean): void {
    const snapshot = this.#snapshot();

    if (snapshot === null) {
      return;
    }

    if (row !== null) {
      snapshot.exposed = true;

      return;
    }

    if (!requested) {
      this.#retire();

      return;
    }

    if (snapshot.exposed) {
      this.#lapse();
    }
  }

  /**
   * After a movement from `origin` to `caret`: into another invalid token it requests the list,
   * otherwise it clears a request that isn't Shown.
   */
  #moved(caret: number | null, origin: number | null): void {
    const tokens = untracked(this.tokens);
    const next = tokenAt(tokens, caret);
    const opens = next?.error !== undefined && !sameRange(next, tokenAt(tokens, origin));

    if (opens && !untracked(this.disabled)) {
      this.requested.set(true);

      return;
    }

    if (untracked(this.requested) && !untracked(this.participating)) {
      this.requested.set(false);
    }
  }

  /** Eligibility loss: a highlight the user saw arms the guard; the snapshot retires. */
  #lapse(): void {
    if (untracked(this.#snapshot)?.exposed === true) {
      this.#lapsed = true;
    }

    this.#retire();
  }

  /** An intentional reset: the guard clears and the snapshot retires. */
  #reset(): void {
    this.#lapsed = false;
    this.#retire();
  }

  #retire(): void {
    if (untracked(this.#snapshot) !== null) {
      this.#snapshot.set(null);
    }

    this.#listbox.activate(null);
  }

  /** The Input was destroyed: everything it fed resets, and a later one starts from nothing. */
  #detached(): void {
    if (this.#destroyed) {
      return;
    }

    this.#blurs += 1;
    this.caretRead(null, "baseline");
    this.#composing.set(false);
    this.#scrollLeft.set(0);
    this.requested.set(false);
    this.#interaction += 1;
    this.#reset();
  }

  #registerOne<T>(
    slot: WritableSignal<T | null>,
    part: T,
    destroyRef: DestroyRef,
    role: string,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (untracked(slot) !== null) {
      throw new Error(`Query field supports only one mounted ${role}.`);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (untracked(slot) === part) {
        slot.set(null);
      }
    });
  }
}

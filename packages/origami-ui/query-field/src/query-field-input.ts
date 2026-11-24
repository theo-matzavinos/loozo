import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  Injector,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { EventPhase } from "@angular/core/primitives/event-dispatch";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { OrigamiPopoverAnchor, OrigamiPopoverAnchorOptions } from "@loozo/origami-ui/popover";
import { injectDeferred, injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { revealCaret } from "./caret-reveal";
import type { OrigamiQueryAnalysis, OrigamiQuerySuggestion } from "./query-analysis";
import { QueryFieldContext } from "./query-field-context";
import type { QueryFieldCaretCause, QueryFieldPresentation } from "./query-field-context";
import { applyPick } from "./query-field-pick";

/** Substitutable input identity; it supplies the composed Popover Anchor's Options. */
export abstract class OrigamiQueryFieldInputOptions {
  /**
   * Effective reactive DOM ID, also the composed Popover Anchor's; a Field's `<label for>` names
   * it. Generated identity is only the direct directive's default.
   */
  abstract readonly id: Signal<string>;

  /**
   * Replaces input Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiQueryFieldInputOptions> | AbstractType<OrigamiQueryFieldInputOptions>,
  ): Provider {
    return { provide: OrigamiQueryFieldInputOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the input Options without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `id`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiQueryFieldInputOptions): Provider {
    return { provide: OrigamiQueryFieldInputOptions, useFactory: factory };
  }
}

/**
 * Whether Angular is replaying an event that reached the server-rendered input before it hydrated:
 * eager hydration marks it `EventPhase.REPLAY`, incremental hydration delivers it after its
 * dispatch ended, in phase `NONE`. The input's first render already took its text.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE;
}

/** A pick in progress: whether its insertion's `input` event arrived. */
interface PickToken {
  seen: boolean;
}

/** A primary press on the unfocused input, and its `mousedown` once that arrives. */
interface Press {
  readonly pointerId: number;
  mousedown: MouseEvent | null;
}

/**
 * The input of an `ogQueryField`: the one native single-line `<input>` that holds the query, owns
 * its caret, selection, scroll and undo history, and keeps focus while the list is open. Static
 * `role="combobox"`, `aria-autocomplete="list"`, `autocomplete="off"`, `spellcheck="false"`,
 * `autocapitalize="off"` and `autocorrect="off"` (a value written in the template wins). It
 * composes the Popover Anchor, so the list is positioned against it. `aria-expanded` is `"true"`
 * while the list shows current suggestions, `aria-controls` names registered Content and
 * `aria-activedescendant` the highlighted suggestion; `aria-invalid="true"` while a current token
 * is invalid, overwriting a template value.
 *
 * Text: its `value` attribute is the query until its first render, then never changes, so the
 * server renders the query and nothing else writes the text but the user, a pick, and, after a
 * render, a query written from outside (when it differs from the text, outside a composition).
 * Every edit writes `query`, then reads the caret, in its `input` event. During an IME composition
 * nothing is written or read and no key is handled; at its end, changed text is one edit, which
 * beats a query written from outside meanwhile.
 *
 * Keys, with Ctrl and Meta ignored, as are keys already `defaultPrevented`, keys during a
 * composition and keys while disabled; Alt only with the arrows; Shift with an arrow or a page key
 * stays native selection. ArrowDown and ArrowUp open the
 * list with the first or last suggestion highlighted while it has current suggestions, else stay
 * native; Alt+ArrowDown opens it with nothing highlighted. In the open list ArrowDown, ArrowUp,
 * PageDown and PageUp move the highlight without wrapping, Alt+ArrowUp and Tab close it, Escape
 * closes it keeping the text, focus and caret, and Home, End, Left and Right stay native. Escape
 * also withdraws a list that isn't shown: while it waits for suggestions the key keeps its default
 * (an enclosing Dialog closes too), in the moment before it shows the key is consumed. Enter picks
 * the highlighted suggestion; with none it emits the root's `search` and keeps its default, except
 * once right after a highlight the user saw lapsed, when it does nothing, its default prevented.
 * The input needs the native selection APIs: `type="text"` (the default) or `type="search"`.
 *
 * Field: inside an `ogField` it is the Field's control (`<label for>` names it), and its
 * `aria-describedby` names the Field's Descriptions, its mounted Errors, then, while a token is
 * invalid, the root's `ogQueryFieldErrors`. Outside a Field, name it with `aria-label` or
 * `aria-labelledby`. Requires a nearest query field root; a second mounted input fails. It has no
 * `state`: read the root's.
 */
@Directive({
  selector: "input[ogQueryFieldInput]",
  exportAs: "ogQueryFieldInput",
  hostDirectives: [OrigamiPopoverAnchor, ɵOrigamiDescribedBy],
  providers: [
    OrigamiQueryFieldInputOptions.provideExisting(() => OrigamiQueryFieldInput),
    OrigamiPopoverAnchorOptions.provideFactory(() => ({
      id: inject(OrigamiQueryFieldInputOptions).id,
    })),
  ],
  host: {
    role: "combobox",
    "aria-autocomplete": "list",
    autocomplete: "off",
    spellcheck: "false",
    autocapitalize: "off",
    autocorrect: "off",
    "[attr.value]": "seed()",
    "[disabled]": "disabled()",
    "[attr.aria-expanded]": "expanded()",
    "[attr.aria-controls]": "controls()",
    "[attr.aria-activedescendant]": "activeDescendant()",
    "[attr.aria-invalid]": "ariaInvalid()",
    "(beforeinput)": "beforeInput($event)",
    "(input)": "edited($event)",
    "(compositionstart)": "compositionStarted($event)",
    "(compositionend)": "compositionEnded($event)",
    "(selectionchange)": "selectionChanged($event)",
    "(select)": "selectionChanged($event)",
    "(focus)": "focused($event)",
    "(blur)": "blurred($event)",
    "(scroll)": "scrolled()",
    "(pointerdown)": "pointerDown($event)",
    "(mousedown)": "mouseDown($event)",
    "(document:pointerup)": "pressEnded($event)",
    "(document:pointercancel)": "pressEnded($event)",
    "(document:click)": "pressEnded($event)",
    "(keydown)": "keydown($event)",
    "(document:pointerdown)": "documentPointerDown($event)",
  },
})
export class OrigamiQueryFieldInput implements OrigamiQueryFieldInputOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("query-field-input"));

  readonly #options = injectDeferred(OrigamiQueryFieldInputOptions);
  readonly #context = inject(QueryFieldContext);
  readonly #element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #injector = inject(Injector);
  readonly #describedBy = inject(ɵOrigamiDescribedBy, { self: true });
  readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly #membership = new ɵOrigamiFieldMembership(() => this.#options().id(), {
    labelable: true,
    formState: () => null,
  });
  /** The template's static `aria-label`, which also names Content without its own name. */
  readonly #staticLabel = inject(new HostAttributeToken("aria-label"), { optional: true });
  /** The query the `value` attribute keeps from the first render on; null until then. */
  readonly #frozen = signal<string | null>(null);
  /**
   * False until the first render of an input that hydrates (its server element carries a `value`
   * attribute when it's created): its edits before then are taken from its text at that render.
   */
  #rendered = !this.#browser || !this.#element.hasAttribute("value");
  /** `ngOnInit` ran: Angular has set the root's inputs. */
  #initialized = false;
  /** The first render's attach ran. */
  #attached = false;
  #destroyed = false;
  /** The text at the open composition's start. */
  #base = "";
  /**
   * The text a composition left when it ended, until the next `input`, a `beforeinput` outside a
   * composition or the next composition's start: Firefox's `input` after `compositionend` that
   * leaves this text isn't another edit.
   */
  #marker: string | null = null;
  /**
   * A live primary press on the unfocused input, until it ends or a focus takes it: the focus its
   * uncancelled `mousedown` gives is pointer-started, a movement. Without that `mousedown` (its
   * `pointerdown` or itself cancelled, or a focus before it) the press gives none.
   */
  #press: Press | null = null;
  /** Counts focuses, so a settling read queued by one never reads for a later one. */
  #focuses = 0;
  /**
   * The focus whose caret read waits for its selection to settle, with the read's cause, until
   * the end of its task, a selection notification or a key.
   */
  #unsettled: { readonly focus: number; readonly pointer: boolean } | null = null;
  /** The selection the input keeps while unfocused, which a focus that isn't pointer-started restores. */
  #rest: readonly [number | null, number | null] = [null, null];
  /** A pick's insertion is running. */
  #picking: PickToken | null = null;

  /** @internal The `value` attribute: the query until the first render, then fixed. */
  protected readonly seed = computed(() => this.#frozen() ?? this.#context.query());
  /** @internal Natively disabled with the root. */
  protected readonly disabled = this.#context.disabled;
  /** @internal Shown with current suggestions. */
  protected readonly expanded = computed(() => String(this.#context.expanded()));
  /** @internal Registered Content's ID. */
  protected readonly controls = this.#context.contentId;
  /** @internal The highlighted suggestion's ID. */
  protected readonly activeDescendant = this.#context.activeDescendant;
  /** @internal `"true"` while a current token is invalid. */
  protected readonly ariaInvalid = computed(() => {
    if (this.#context.invalid()) {
      return "true";
    }

    return null;
  });

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;
    });
  }

  /**
   * @internal Joins the nearest Field, names the token errors in the description while a token
   * is invalid, registers with the root and starts the first render's attach and the reconcile.
   * Does nothing when an earlier hook already destroyed the input's view.
   */
  ngOnInit(): void {
    if (this.#destroyed) {
      return;
    }

    this.#initialized = true;
    this.#membership.register(this.#destroyRef);
    this.#describedBy.register(() => {
      const id = this.#context.errorsId();

      if (id === null || !this.#context.invalid()) {
        return [];
      }

      return [id];
    }, this.#destroyRef);
    this.#context.registerInput(
      {
        element: this.#element,
        labelledBy: this.#membership.labelledBy,
        label: this.#staticLabel,
        pick: (suggestion, analysis) => this.#pick(suggestion, analysis),
      },
      this.#destroyRef,
    );

    // After each render that follows a query or composition change: the attach at the first, then
    // the reconcile, the one path that shows a query written from outside.
    afterRenderEffect(
      () => {
        // The root's own query signal, read so a write back to the value it held before an edit,
        // from `queryChange` or later before this render, still reruns the reconcile.
        this.#context.queryWritten();

        const query = this.#context.query();
        const composing = this.#context.composing();

        untracked(() => this.#afterRender(query, composing));
      },
      { injector: this.#injector },
    );
  }

  /** @internal Outside a composition, an edit's `beforeinput` disarms the composition marker. */
  protected beforeInput(event: Event): void {
    if (this.#live(event) && !this.#context.composing() && !this.#composingEvent(event)) {
      this.#marker = null;
    }
  }

  /**
   * @internal An edit: the text becomes the query and the caret is read, unless it's part of a
   * composition, or the trailing notification of one that already ended with this text.
   */
  protected edited(event: Event): void {
    if (
      !this.#live(event) ||
      !this.#rendered ||
      this.#context.composing() ||
      this.#composingEvent(event)
    ) {
      return;
    }

    const marker = this.#marker;

    this.#marker = null;

    if (marker !== null && this.#element.value === marker) {
      return;
    }

    this.#edit();
  }

  /** @internal A composition started: its text is taken once, when it ends. */
  protected compositionStarted(event: Event): void {
    if (!this.#live(event)) {
      return;
    }

    this.#marker = null;
    this.#base = this.#element.value;
    this.#context.compositionStarted();
  }

  /**
   * @internal A composition ended: changed text is one edit; either way the caret is read again
   * and the marker is armed with the text.
   */
  protected compositionEnded(event: Event): void {
    if (!this.#live(event) || !this.#context.composing()) {
      return;
    }

    this.#context.compositionEnded();

    if (this.#element.value !== this.#base) {
      this.#edit();
    } else {
      this.#readCaret("baseline");
    }

    this.#marker = this.#element.value;
  }

  /**
   * @internal The input's selection changed: read the caret, outside a composition; while
   * unfocused it's the selection focus will restore.
   */
  protected selectionChanged(event: Event): void {
    if (!this.#live(event) || !this.#rendered || this.#context.composing()) {
      return;
    }

    if (!this.#element.matches(":focus")) {
      this.#keepRest();
    }

    if (this.#unsettled !== null) {
      this.#settle();

      return;
    }

    this.#readCaret("move");
  }

  /**
   * @internal Focus arrived: the caret is read, as a movement after a primary press on the
   * input whose uncancelled `mousedown` arrived, else as a baseline (Tab, script or a Label).
   * WebKit reports `[0, 0]` during every `focus` event and sets the real selection later in the
   * focus's task (the selection kept at rest, or Tab's select-all) without a notification, so a
   * `[0, 0]` read waits until the task ended: the next selection notification, key or task
   * settles it (`#settle`). Any other read is the real selection in every engine.
   */
  protected focused(event: Event): void {
    const press = this.#press;

    this.#press = null;
    this.#focuses += 1;
    this.#unsettled = null;

    if (!this.#live(event) || !this.#rendered || this.#context.composing()) {
      return;
    }

    const pointer = press?.mousedown?.defaultPrevented === false;

    if (this.#element.selectionStart !== 0 || this.#element.selectionEnd !== 0) {
      this.#readCaret(pointer ? "move" : "baseline");

      return;
    }

    const focus = this.#focuses;

    this.#unsettled = { focus, pointer };
    setTimeout(() => {
      if (this.#unsettled?.focus === focus) {
        this.#settle();
      }
    });
  }

  /** @internal Focus left: the caret is null and the list closes. */
  protected blurred(event: Event): void {
    this.#press = null;
    this.#unsettled = null;

    if (this.#live(event)) {
      this.#keepRest();
      this.#context.blurred();
    }
  }

  /** @internal The input scrolled horizontally. */
  protected scrolled(): void {
    if (this.#initialized && !this.#destroyed) {
      this.#context.scrolled(this.#element.scrollLeft);
    }
  }

  /** @internal A live primary press on the unfocused input makes the focus it gives pointer-started. */
  protected pointerDown(event: PointerEvent): void {
    this.#press = null;

    if (
      this.#live(event) &&
      event.isPrimary &&
      event.button === 0 &&
      !this.#element.matches(":focus")
    ) {
      this.#press = { pointerId: event.pointerId, mousedown: null };
    }
  }

  /**
   * @internal The press's `mousedown`, whose default gives the focus: a consumer that cancels it
   * keeps focus from the press, so a later focus isn't the press's.
   */
  protected mouseDown(event: MouseEvent): void {
    if (this.#press !== null && this.#press.mousedown === null) {
      this.#press.mousedown = event;
    }
  }

  /**
   * @internal A pointer's press ended: when it's the recorded press, which didn't focus the input
   * (its default prevented, say), the next focus is a baseline. A touch press focuses at its
   * compatibility `mousedown`, after `pointerup`, so it ends at `click` or `pointercancel`.
   */
  protected pressEnded(event: Event): void {
    const press = this.#press;

    if (press === null) {
      return;
    }

    if (event instanceof PointerEvent) {
      if (event.pointerId !== press.pointerId) {
        return;
      }

      if (event.type === "pointerup" && event.pointerType === "touch") {
        return;
      }
    }

    this.#press = null;
  }

  /** @internal A primary press anywhere: outside the input and Content it clears a request that isn't Shown. */
  protected documentPointerDown(event: PointerEvent): void {
    if (this.#live(event) && event.isPrimary && event.button === 0) {
      this.#context.pressedOutside(event.composedPath());
    }
  }

  /** @internal The query field's keys; handled keys prevent their default. */
  protected keydown(event: KeyboardEvent): void {
    if (
      !this.#live(event) ||
      event.defaultPrevented ||
      event.isComposing ||
      this.#context.composing() ||
      event.ctrlKey ||
      event.metaKey ||
      this.#context.disabled()
    ) {
      return;
    }

    const key = event.key;

    if (event.altKey && key !== "ArrowDown" && key !== "ArrowUp") {
      return;
    }

    // Shift with an arrow or a page key extends the native selection, a native editing key.
    if (
      event.shiftKey &&
      (key === "ArrowDown" || key === "ArrowUp" || key === "PageDown" || key === "PageUp")
    ) {
      return;
    }

    // A dismissing key classifies the request before any caret read it brings (plan-4 R3-F04),
    // the waiting focus's included, then settles what that read finds, so a queued selection
    // notification or a focus read can't reopen what the key dismissed.
    const dismissing = key === "Escape" || key === "Tab" || (key === "ArrowUp" && event.altKey);
    const presentation = dismissing ? this.#context.presentation() : null;
    const blurs = this.#context.blurs();
    const interaction = this.#context.interaction();

    if (this.#unsettled !== null) {
      this.#settle();
    }

    if (this.#context.blurs() !== blurs) {
      this.#unfocused(event, false, presentation, interaction);

      return;
    }

    const had = this.#context.keyArrived();

    if (presentation !== null) {
      const visible = presentation === "shown" || presentation === "lapsed";

      this.#resample();

      if (this.#context.blurs() !== blurs) {
        this.#unfocused(event, had, presentation, interaction);

        return;
      }

      if (key === "Escape") {
        this.#context.escape(event, presentation);
      } else if (visible) {
        if (key !== "Tab") {
          event.preventDefault();
        }

        this.#context.close();
      }

      return;
    }

    if (!this.#handles(key)) {
      return;
    }

    this.#resample();

    if (this.#context.blurs() !== blurs) {
      this.#unfocused(event, had, presentation, interaction);

      return;
    }

    if (key === "Enter") {
      this.#context.enter(event, had);

      return;
    }

    const shown = this.#context.shown();
    const rows = this.#context.hasRows();

    if (key === "ArrowDown" && event.altKey) {
      if (!shown && rows) {
        event.preventDefault();
        this.#context.openAt("none");
      }

      return;
    }

    if (!rows) {
      return;
    }

    if (key === "PageDown" || key === "PageUp") {
      if (shown) {
        event.preventDefault();
        this.#context.move(key === "PageDown" ? "pageDown" : "pageUp");
      }

      return;
    }

    event.preventDefault();

    if (shown) {
      this.#context.move(key === "ArrowDown" ? "next" : "previous");
    } else {
      this.#context.openAt(key === "ArrowDown" ? "first" : "last");
    }
  }

  /**
   * A `caretChange` subscriber moved focus away while the key was read: the blur reset the
   * interaction and whatever the subscriber did since owns the state, so the key changes none of
   * it and only settles its own event. Enter is consumed when a highlight was presented or lapsed
   * at its arrival, and otherwise still searches for the Input that received it, unless that Input
   * was replaced. Escape that classified a list Shown, Lapsed or Opening is consumed, as it would
   * have been, so an enclosing layer doesn't take it; Alt+ArrowUp prevents as it classified.
   */
  #unfocused(
    event: KeyboardEvent,
    had: boolean,
    presentation: QueryFieldPresentation | null,
    interaction: number,
  ): void {
    const key = event.key;

    if (key === "Enter") {
      if (had) {
        event.preventDefault();
      } else if (this.#context.interaction() === interaction) {
        this.#context.search();
      }

      return;
    }

    if (
      (key === "Escape" && presentation !== "closed" && presentation !== "pending") ||
      (key === "ArrowUp" && (presentation === "shown" || presentation === "lapsed"))
    ) {
      event.preventDefault();
    }
  }

  /** Whether `key` is one the query field handles after reading the live caret. */
  #handles(key: string): boolean {
    return (
      key === "ArrowDown" ||
      key === "ArrowUp" ||
      key === "PageDown" ||
      key === "PageUp" ||
      key === "Enter"
    );
  }

  /**
   * Before a key's decision: a live caret that differs from the caret is a movement read first.
   * An input a subscriber already blurred reads nothing: its caret is the blur's null.
   */
  #resample(): void {
    if (!this.#element.matches(":focus")) {
      return;
    }

    const live = this.#liveCaret();

    if (live !== this.#context.caret()) {
      this.#context.resampled(live);
    }
  }

  /** Whether the event is genuine and the input is registered and alive. */
  #live(event: Event): boolean {
    return this.#initialized && !this.#destroyed && !replayed(event);
  }

  #composingEvent(event: Event): boolean {
    return event instanceof InputEvent && event.isComposing;
  }

  /** The collapsed caret while focused, else null. */
  #liveCaret(): number | null {
    const start = this.#element.selectionStart;

    if (
      !this.#element.matches(":focus") ||
      start === null ||
      start !== this.#element.selectionEnd
    ) {
      return null;
    }

    return start;
  }

  /**
   * Reads the waiting focus's caret once its task ended. A pointer-started focus's is a movement.
   * Otherwise the selection kept at rest is the one the focus restored, a baseline, and any other
   * is a movement from that collapsed selection made since (a script's in the focusing task,
   * whose notification may come later) or Tab's select-all, which reads null. Only the settled
   * caret is published.
   */
  #settle(): void {
    const unsettled = this.#unsettled;

    this.#unsettled = null;

    if (
      unsettled === null ||
      this.#destroyed ||
      this.#context.composing() ||
      !this.#element.matches(":focus")
    ) {
      return;
    }

    const restored =
      this.#element.selectionStart === this.#rest[0] &&
      this.#element.selectionEnd === this.#rest[1];

    if (unsettled.pointer) {
      this.#readCaret("move");
    } else if (restored) {
      this.#readCaret("baseline");
    } else {
      const [start, end] = this.#rest;

      this.#context.caretRead(this.#liveCaret(), "move", start === end ? start : null);
    }
  }

  /** Keeps the selection the input has while unfocused, which focus restores. */
  #keepRest(): void {
    this.#rest = [this.#element.selectionStart, this.#element.selectionEnd];
  }

  #readCaret(cause: QueryFieldCaretCause): void {
    this.#context.caretRead(this.#liveCaret(), cause);
  }

  #edit(): void {
    if (this.#picking !== null) {
      this.#picking.seen = true;
    }

    this.#context.edited(this.#element.value, this.#liveCaret());
  }

  /**
   * The first render's attach, then the reconcile: an input whose text differs from the query
   * shows the query, outside a composition and a pick, and a focused one moves its caret to the
   * end.
   */
  #afterRender(query: string, composing: boolean): void {
    if (this.#destroyed) {
      return;
    }

    if (!this.#attached) {
      this.#attached = true;
      this.#attach(query, composing);

      return;
    }

    if (composing || this.#picking !== null || this.#element.value === query) {
      return;
    }

    this.#element.value = query;

    let caret: number | null = null;

    if (this.#element.matches(":focus")) {
      this.#element.setSelectionRange(query.length, query.length);
      caret = this.#liveCaret();
    } else {
      this.#keepRest();
    }

    this.#context.written(caret);
  }

  /**
   * At the first render: freezes the `value` attribute, adopts text typed into a hydrating input
   * before then without opening, reads the scroll offset and, when focused, takes the caret as a
   * baseline.
   */
  #attach(query: string, composing: boolean): void {
    this.#frozen.set(query);

    if (!this.#rendered) {
      this.#rendered = true;

      if (!composing && this.#element.value !== query) {
        this.#context.adopt(this.#element.value);
      }
    } else if (!composing && this.#element.value !== query) {
      this.#afterRender(query, composing);
    }

    this.#context.scrolled(this.#element.scrollLeft);

    if (!this.#element.matches(":focus")) {
      this.#keepRest();
    }

    if (!composing) {
      this.#readCaret("baseline");
    }
  }

  /** Applies a pick that passed activation; reveals the caret after a successful insertion. */
  #pick(suggestion: OrigamiQuerySuggestion, analysis: OrigamiQueryAnalysis): void {
    if (this.#destroyed) {
      return;
    }

    const outcome = applyPick(
      {
        element: this.#element,
        query: this.#context.query(),
        blocked: this.#context.disabled() || this.#context.composing(),
        insert: (command) => {
          const token: PickToken = { seen: false };

          this.#picking = token;

          try {
            return { returned: command(), seen: token.seen };
          } finally {
            this.#picking = null;
          }
        },
      },
      suggestion,
      analysis,
    );

    if (outcome === "equal") {
      this.#readCaret("pick");
      this.#context.picked();

      return;
    }

    if (outcome === "success") {
      const caret = this.#element.selectionStart;

      if (caret !== null) {
        revealCaret(this.#element, caret);
      }

      this.#context.picked();
    }
  }
}

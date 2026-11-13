import {
  APP_ID,
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  PLATFORM_ID,
  afterNextRender,
  afterEveryRender,
  computed,
  inject,
  untracked,
  ɵEVENT_REPLAY_QUEUE as EVENT_REPLAY_QUEUE,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  EventInfoWrapper,
  EventPhase,
  getAppScopedQueuedEventInfos,
} from "@angular/core/primitives/event-dispatch";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { NumberFieldContext } from "./number-field-context";

/** An Input's selection, its direction included, which an undone edit puts back. */
interface InputSelection {
  readonly start: number | null;
  readonly end: number | null;
  readonly direction: "forward" | "backward" | "none" | undefined;
}

/**
 * The server's text, and the value it shows, that a hydrating Input's first render found
 * unchanged: an edit made before hydration may have left that same text.
 */
interface UnchangedText {
  readonly text: string;
  readonly value: number | null;
}

/**
 * Whether Angular is replaying an event that reached the server-rendered Input before it
 * hydrated. Its edit is already in the element's text, which the Input's first render adopted or
 * restored, so a replayed edit isn't another edit, unless that render found the server's text
 * unchanged and nothing has happened since: then it was an edit that left the same text. Eager
 * replay waits for the application to be stable, so an edit, a value write or a step can come
 * first, and the text is no longer the replayed edit's. A replayed composition event is older than
 * any genuine one, so it neither opens nor closes the composition. Eager hydration's replay
 * marks the event `EventPhase.REPLAY`; incremental hydration's calls the listeners with the
 * browser's event after its dispatch has ended, when its phase is `NONE`.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE;
}

/**
 * Whether the events Angular holds for replay leave a composition open in `element`: its last
 * queued `compositionstart` has no `compositionend` after it. Eager hydration queues every event
 * until the application is stable; incremental hydration queues a block's events until it has
 * hydrated the block.
 */
function composingInReplay(
  element: HTMLInputElement,
  appId: string,
  blockQueue: readonly { readonly event: Event }[],
): boolean {
  let composing = false;

  for (const event of [
    ...getAppScopedQueuedEventInfos(appId).map((info) => new EventInfoWrapper(info).getEvent()),
    ...blockQueue.map((queued) => queued.event),
  ]) {
    if (event.target !== element) {
      continue;
    }

    if (event.type === "compositionstart") {
      composing = true;
    } else if (event.type === "compositionend") {
      composing = false;
    }
  }

  return composing;
}

function selectionOf(element: HTMLInputElement): InputSelection {
  return {
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection ?? undefined,
  };
}

/**
 * The text input of a number field: a native `<input>` the root makes `type="text"` and fills
 * with the value in its locale's format (`1.234,50` in `el`). It has no inputs and no `state`:
 * read the root's. Requires a nearest number field root, which supports one mounted Input; a
 * second fails when it registers.
 *
 * Editing: typing, deleting, pasting and dropping apply natively; an edit that leaves text which
 * isn't the start of a number in the locale's grammar (a letter, a third fraction digit at two,
 * a second decimal separator) is undone, its text and selection, direction included, restored,
 * before the next frame.
 * The browser's own `input` event still reaches listeners before the undo, so a capture-phase
 * listener sees the transient text. A composition from an input method is checked once, when it
 * ends; Firefox's `input` after its end isn't another edit. Text that is a whole number commits at once; empty text commits null; a lone minus or
 * decimal separator, or misplaced group separators, keep the value and report a parse error.
 * Leaving the Input shows a whole number in the format (`1234,5` becomes `1.234,50`) without a
 * write, and is the root's `touch`.
 *
 * Keys: ArrowUp and ArrowDown step by the root's `step` and prevent their default; with Alt, Ctrl,
 * Meta or Shift, while composing, or when already `defaultPrevented`, they're native. Home, End,
 * PageUp, PageDown and Enter are native. A step that writes a value moves the caret to the end of
 * the new text, also when the text is the same.
 *
 * Host semantics: static `type="text"`, `autocomplete="off"`, `autocorrect="off"` and
 * `spellcheck="false"`; `inputmode` `"decimal"` while fraction digits are allowed, else
 * `"numeric"` (iOS decimal and numeric keypads have no minus: negatives then come by stepping);
 * its static `id`, else a generated one kept through hydration; native `disabled` and `readonly`
 * from the root; the `value` attribute, the text, so the server renders it. Its role is the
 * implicit textbox.
 *
 * Field: inside an `ogField` it is the Field's control, governed by the `[formField]` on the
 * root; don't add `ogFieldControl`. The Field's Labels name it with `for`, and its
 * `aria-describedby` names the Field's Descriptions, then its mounted Errors, merged with the IDs
 * of a co-applied `ogTooltipTrigger` in the order they initialize. It carries
 * `aria-invalid="true"` while the Field shows its errors and `aria-required="true"` while the
 * bound field is required, absent otherwise. Outside a Field, and as a second control the Field
 * ignores, it keeps its static ARIA attributes.
 *
 * Hydration: a server-rendered Input keeps the server's text, and text typed into it before its
 * block hydrates is taken as an edit once it has rendered, or replaced with the value's text if
 * an edit couldn't have left it. That one check is all the edit gets: Angular's replay of its
 * `beforeinput`, `input` and composition events doesn't edit again. An edit that left the
 * server's text as it was (`3` typed over the `3` of `1,23`) is taken once, at the first replayed
 * `input` that isn't part of a composition, or replayed `compositionend`, so it commits as it would
 * after hydration; untouched server text has no replayed `input` and keeps a value with more
 * fraction digits than it shows.
 * The replay takes it only while nothing has happened since the first render: after an edit, a
 * value write, a step or a new format (eager replay waits for the application to be stable, so
 * these can come first), the replayed `input` is ignored, and the edit it reports is lost.
 * A composition that spans hydration is checked once, when it ends: one still open at the first
 * render keeps its text until then, also when Angular replays its start only later, and one that
 * ended before commits once, at its replayed `compositionend` when it left the server's text.
 *
 * @example
 * ```html
 * <div ogNumberField [(value)]="quantity">
 *   <input ogNumberFieldInput aria-label="Quantity" />
 * </div>
 * ```
 */
@Directive({
  selector: "input[ogNumberFieldInput]",
  hostDirectives: [ɵOrigamiDescribedBy],
  host: {
    type: "text",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: "false",
    "[attr.id]": "id",
    "[attr.inputmode]": "inputMode()",
    "[attr.value]": "text()",
    "[disabled]": "disabled()",
    "[attr.readonly]": "readonlyAttribute()",
    "[attr.aria-invalid]": "invalid()",
    "[attr.aria-required]": "required()",
    "(beforeinput)": "beforeInput($event)",
    "(input)": "edited($event)",
    "(compositionstart)": "compositionStart($event)",
    "(compositionend)": "compositionEnd($event)",
    "(keydown)": "keydown($event)",
    "(blur)": "left()",
  },
})
export class OrigamiNumberFieldInput {
  readonly #context = inject(NumberFieldContext);
  readonly #element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  readonly #appId = inject(APP_ID);
  readonly #blockQueue = inject(EVENT_REPLAY_QUEUE);

  /** @internal A static `id` from the template, else a generated one kept through hydration. */
  protected readonly id =
    inject(new HostAttributeToken("id"), { optional: true }) ??
    injectUniqueId("number-field-input");

  readonly #membership = new ɵOrigamiFieldMembership(() => this.id, {
    labelable: true,
    formState: () => this.#context.formState(),
  });
  /**
   * False until the first render of an Input that hydrates (its server element carries a `value`
   * attribute when it is created): `input` events before then aren't parsed; the first render
   * takes the element's text instead, unless a composition is open, whose end checks it, and the
   * edits Angular replays afterwards aren't parsed, but for one that left the server's text
   * unchanged (see `#unchanged`).
   */
  #rendered = !isPlatformBrowser(inject(PLATFORM_ID)) || !this.#element.hasAttribute("value");
  /**
   * The server's text and value a hydrating Input's first render found unchanged, which the first
   * replayed non-composing `input` or `compositionend` takes as an edit that left that text, while
   * the element and the draft still show it and the value is still the same. Null before that
   * render, after it adopted or restored the text or left an open composition to its end, for an
   * Input that doesn't hydrate, and once anything has happened since: that replay, an edit that
   * reaches its check, or a sync after render that finds another draft or value.
   */
  #unchanged: UnchangedText | null = null;
  /** The selection at the edit's `beforeinput`, restored with the text if the edit is undone. */
  #selection: InputSelection | null = null;
  /**
   * A composition is open: from a genuine `compositionstart`, or from the first render when the
   * events Angular holds for replay leave one open in the element, until a genuine
   * `compositionend`.
   */
  #composing = false;
  /**
   * The text a composition left in the element when its end was checked, until the next `input`,
   * an edit's `beforeinput` or a composition's start: Firefox dispatches the composition's last
   * `input` after `compositionend`, not composing, and that event isn't a new edit.
   */
  #composedText: string | null = null;
  /** The text the last accepted edit left in the element, until the next sync after render. */
  #editedText: string | null = null;
  /** The draft the last sync after render found; null before the first. */
  #shown: string | null = null;
  /** The Context's step count the last sync after render found. */
  #stepsShown = untracked(this.#context.steps);

  /** @internal The draft, the server's `value` attribute. */
  protected readonly text = this.#context.text;
  /** @internal */
  protected readonly inputMode = this.#context.inputMode;
  /** @internal */
  protected readonly disabled = this.#context.disabled;
  /** @internal */
  protected readonly readonlyAttribute = computed(() => {
    if (this.#context.readonly()) {
      return "";
    }

    return null;
  });
  /** @internal `"true"` while the Field shows its errors. */
  protected readonly invalid = this.#membership.invalid;
  /** @internal `"true"` while the bound field is required. */
  protected readonly required = this.#membership.required;

  constructor() {
    // The text that hydration didn't parse: an edit made before the block hydrated, or the
    // server's own text. A composition still open then, which Angular hasn't replayed yet, is
    // left to its end.
    afterNextRender(() => {
      if (this.#rendered) {
        return;
      }

      this.#rendered = true;

      if (this.#composing || composingInReplay(this.#element, this.#appId, this.#blockQueue)) {
        this.#composing = true;

        return;
      }

      const text = this.#element.value;

      if (text === this.#context.text()) {
        this.#unchanged = { text, value: this.#context.value() };

        return;
      }

      if (this.#context.accepts(text)) {
        this.#editedText = text;
        this.#context.edit(text);

        return;
      }

      this.#element.value = this.#context.text();
    });

    // After every render the element shows the draft: a text the user didn't type (a value
    // write, a step, the format on blur) is written to the property where it differs, since the
    // `value` attribute stops showing once the user has edited. A text that changed without an
    // edit also moves a focused Input's caret to the end, as writing it does: where the attribute
    // showed it, the caret was left at the start in Chromium. So does a step whose value shows as
    // the same text (`1` up by 0.1 at no fraction digits). Comparing with the element, not
    // tracking changes of the draft, also catches an edit and a step between two renders that
    // bring the draft back to its text. Nothing before a hydrating Input's first render: it keeps
    // the server's text, or what the user typed into it, until it is adopted; nothing during a
    // composition, whose text is checked when it ends. A draft or value other than the server's
    // (a write, a step, a new format) ends a replay's claim to the unchanged text, also when a
    // later change brings them back.
    afterEveryRender(() => {
      if (!this.#rendered || this.#composing) {
        return;
      }

      const text = this.#context.text();
      const steps = this.#context.steps();
      const unchanged = this.#unchanged;

      if (
        unchanged !== null &&
        (unchanged.text !== text || unchanged.value !== this.#context.value())
      ) {
        this.#unchanged = null;
      }

      const changed = this.#shown !== null && this.#shown !== text && text !== this.#editedText;

      this.#shown = text;
      this.#editedText = null;

      let moved = changed || steps !== this.#stepsShown;

      this.#stepsShown = steps;

      if (this.#element.value !== text) {
        this.#element.value = text;
        moved = true;
      }

      if (moved && this.#element.matches(":focus")) {
        this.#element.setSelectionRange(text.length, text.length);
      }
    });
  }

  /** @internal Joins the nearest Field and registers with the root once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
    this.#context.registerInput({ element: this.#element, id: this.id }, this.#destroyRef);
  }

  /** @internal Records the selection an undone edit restores. */
  protected beforeInput(event: Event): void {
    if (replayed(event) || this.#composing || (event instanceof InputEvent && event.isComposing)) {
      return;
    }

    this.#composedText = null;
    this.#selection = selectionOf(this.#element);
  }

  /**
   * @internal Checks the edit the browser applied, unless it is part of a composition, including
   * the `input` after a composition's end that leaves the text its end was checked with, or a
   * replay of an edit the first render already adopted or restored. The first replay after a first
   * render that found the server's text unchanged is an edit that left the same text: it is
   * checked once, if the element, the draft and the value still are the server's.
   */
  protected edited(event: Event): void {
    if (this.#composing || (event instanceof InputEvent && event.isComposing)) {
      return;
    }

    if (replayed(event)) {
      this.#takeUnchanged();

      return;
    }

    const composedText = this.#composedText;

    this.#composedText = null;

    if (composedText === this.#element.value) {
      return;
    }

    this.#check();
  }

  /**
   * @internal A composition started: its edits are checked when it ends. A replayed start is
   * older than anything genuine: the first render already found whether its composition is open.
   */
  protected compositionStart(event: Event): void {
    if (replayed(event)) {
      return;
    }

    this.#composing = true;
    this.#composedText = null;
    this.#selection = selectionOf(this.#element);
  }

  /**
   * @internal A composition ended: its text is checked once, its trailing `input` included, also
   * when its start came before hydration, unless a second end leaves the text the first checked.
   * A replayed end only takes the server's text a first render found unchanged.
   */
  protected compositionEnd(event: Event): void {
    if (replayed(event)) {
      if (!this.#composing) {
        this.#takeUnchanged();
      }

      return;
    }

    this.#composing = false;

    if (this.#composedText === this.#element.value) {
      return;
    }

    this.#check();
    this.#composedText = this.#element.value;
  }

  /** @internal ArrowUp and ArrowDown step. */
  protected keydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    let direction: 1 | -1;

    if (event.key === "ArrowUp") {
      direction = 1;
    } else if (event.key === "ArrowDown") {
      direction = -1;
    } else {
      return;
    }

    // A replayed key's default already happened.
    if (event.eventPhase !== EventPhase.REPLAY) {
      event.preventDefault();
    }

    this.#context.step(direction);
  }

  /** @internal Focus left the Input. */
  protected left(): void {
    this.#context.left();
  }

  /** Takes the unchanged server text as an edit once, while nothing has happened since. */
  #takeUnchanged(): void {
    const unchanged = this.#unchanged;

    this.#unchanged = null;

    if (
      unchanged === null ||
      this.#element.value !== unchanged.text ||
      this.#context.text() !== unchanged.text ||
      this.#context.value() !== unchanged.value
    ) {
      return;
    }

    this.#check();
  }

  /**
   * Takes the element's text as an edit if the grammar accepts it, else puts the draft's text and
   * the selection before the edit back; either way, a replay may no longer take the unchanged
   * server text. Before the first render of a hydrating Input, nothing.
   */
  #check(): void {
    if (!this.#rendered) {
      return;
    }

    this.#unchanged = null;

    const text = this.#element.value;
    const selection = this.#selection;

    this.#selection = null;

    if (this.#context.accepts(text)) {
      this.#editedText = text;
      this.#context.edit(text);

      return;
    }

    const draft = this.#context.text();

    this.#element.value = draft;

    if (selection === null) {
      this.#element.setSelectionRange(draft.length, draft.length);
    } else {
      this.#element.setSelectionRange(selection.start, selection.end, selection.direction);
    }
  }
}

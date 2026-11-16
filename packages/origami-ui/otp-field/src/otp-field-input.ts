import {
  APP_ID,
  DOCUMENT,
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  PLATFORM_ID,
  afterEveryRender,
  afterNextRender,
  computed,
  inject,
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
import { normalizeCode } from "./otp-code";
import { OtpFieldContext } from "./otp-field-context";

/** An Input's selection, its direction included, which an undone edit puts back. */
interface InputSelection {
  readonly start: number | null;
  readonly end: number | null;
  readonly direction: "forward" | "backward" | "none" | undefined;
}

/** Where a primary pointer went down on the Input, which its `click` maps to a cell. */
interface Press {
  readonly x: number;
  readonly y: number;
}

/** How far, in CSS pixels, a click may move from its press and still map to a cell. */
const CLICK_SLOP = 4;

/**
 * Whether Angular is replaying an event that reached the server-rendered Input before it
 * hydrated. Its edit is already in the element's text, which the Input's first render adopted or
 * restored, so a replayed edit isn't another edit, and a replayed press's default already
 * happened. A replayed composition event is older than any genuine one, so it neither opens nor
 * closes the composition. Eager hydration's replay marks the event `EventPhase.REPLAY`;
 * incremental hydration's calls the listeners with the browser's event after its dispatch has
 * ended, when its phase is `NONE`.
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

/** A press or click with a modifier key held, which stays native. */
function modified(event: MouseEvent): boolean {
  return event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
}

/**
 * The input of an OTP field: one native `<input>` holding the whole code, which the consumer lays
 * transparently over the cells it draws from the root's `state.cells()`. It has no inputs and no
 * `state`: read the root's. Requires a nearest OTP field root, which supports one mounted Input; a
 * second fails when it registers.
 *
 * Editing: every edit's text is read with NFKC and without whitespace and dash-like separators,
 * and is kept when that leaves ASCII digits only, at most the root's `length`. Typing is settled
 * in its `beforeinput`, before the browser applies it, so the browser's undo history is kept: a
 * keystroke whose text wouldn't be kept, a letter or a seventh digit, is cancelled, with no
 * `input` and the text and selection untouched; one typed in another form, a full-width digit, a
 * space or a dash, inserts its digits instead, or nothing, with the browser's own insertion; any
 * other applies natively. Deleting, dropping, autofill and a composition apply natively and are
 * checked on `input`: an accepted text is written back in its read form, the caret after the same
 * digits, and committed when it differs from the value; anything else is undone, its text and
 * selection, direction included, restored, before the next frame, after the browser's own `input`
 * reached listeners, and that undo clears the browser's undo history. A composition from an input
 * method is checked once, when it ends; Firefox's `input` after its end isn't another edit. A
 * collapsed caret inside a full code inserts nothing: select the digit to replace it. Keys are
 * native: arrows, Backspace, Delete, Home, End, Ctrl+A and Enter, which submits the form.
 *
 * Paste: the clipboard's text is read the same way and inserted with the browser's own insertion,
 * so its undo works; a whole code (`length` digits, `987 654` or `９８７６５４` included) replaces
 * the field's whole text, a shorter one goes at the selection if the result fits, and anything
 * else, a longer or non-digit text or one that wouldn't fit, does nothing. Nothing while readonly.
 *
 * Pointer: the Input stretched over the cells maps a click to equal slots, one per cell: a
 * primary, unmodified single click that moved at most 4 CSS px from its press selects that
 * filled cell's digit, so the next digit typed replaces it, or puts the caret at the end of the
 * code on an empty cell. A primary single press first collapses an existing selection, so the
 * browser's own click handling can't undo the mapping. A double-click selects the whole code.
 * Modified and other-button clicks, drags and a Label's click are native.
 *
 * Host semantics: static `inputmode="numeric"`, `autocomplete="one-time-code"` (a value written
 * in the template, static or bound, wins: `new-password` or `current-password` for a PIN),
 * `autocorrect="off"`, `autocapitalize="off"` and `spellcheck="false"`; `type` `"password"` while
 * the root is masked, else `"text"`, overwriting a template `type`; its static `id`, else a
 * generated one kept through hydration; native `disabled` and `readonly` from the root; the
 * `value` attribute, the value, so the server renders it. Its role is the implicit textbox; it
 * has no `maxlength` or `pattern`.
 *
 * Field: inside an `ogField` it is the Field's control, governed by the `[formField]` on the
 * root; don't add `ogFieldControl`. The Field's Labels name it with `for`, and its
 * `aria-describedby` names the Field's Descriptions, then its mounted Errors, merged with the IDs
 * of a co-applied `ogTooltipTrigger` in the order they initialize. It carries
 * `aria-invalid="true"` while the Field shows its errors and `aria-required="true"` while the
 * bound field is required, absent otherwise. Outside a Field, name it with `aria-label` or
 * `aria-labelledby`.
 *
 * Hydration: a server-rendered Input keeps the server's value, and digits typed into it before
 * its block hydrates are taken as one edit once it has rendered, or replaced with the value if no
 * edit could leave them. That one check is all the edit gets: Angular's replay of its
 * `beforeinput`, `input`, composition, `paste`, `mousedown`, `click` and `dblclick` events
 * doesn't act again. A composition still open at the first render keeps its text until its end,
 * which checks it, also when Angular replays its start only later.
 *
 * @example
 * ```html
 * <div ogOtpField #otp="ogOtpField" class="otp" [(value)]="code">
 *   <input ogOtpFieldInput aria-label="Verification code" />
 *   <div class="cells" aria-hidden="true">
 *     @for (cell of otp.state.cells(); track cell.index) {
 *       <span class="cell" [class.caret]="cell.caret" [class.selected]="cell.selected">{{ cell.char }}</span>
 *     }
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "input[ogOtpFieldInput]",
  hostDirectives: [ɵOrigamiDescribedBy],
  host: {
    inputmode: "numeric",
    autocomplete: "one-time-code",
    autocorrect: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "[attr.type]": "type()",
    "[attr.id]": "id",
    "[attr.value]": "value()",
    "[disabled]": "disabled()",
    "[attr.readonly]": "readonlyAttribute()",
    "[attr.aria-invalid]": "invalid()",
    "[attr.aria-required]": "required()",
    "(beforeinput)": "beforeInput($event)",
    "(input)": "edited($event)",
    "(compositionstart)": "compositionStart($event)",
    "(compositionend)": "compositionEnd($event)",
    "(paste)": "pasted($event)",
    "(pointerdown)": "pointerDown($event)",
    "(mousedown)": "mouseDown($event)",
    "(click)": "clicked($event)",
    "(dblclick)": "doubleClicked($event)",
    "(focus)": "mirror()",
    "(select)": "mirror()",
    "(document:selectionchange)": "selectionChanged()",
    "(blur)": "left()",
  },
})
export class OrigamiOtpFieldInput {
  readonly #context = inject(OtpFieldContext);
  readonly #element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);
  readonly #appId = inject(APP_ID);
  readonly #blockQueue = inject(EVENT_REPLAY_QUEUE);

  /** @internal A static `id` from the template, else a generated one kept through hydration. */
  protected readonly id =
    inject(new HostAttributeToken("id"), { optional: true }) ?? injectUniqueId("otp-field-input");

  readonly #membership = new ɵOrigamiFieldMembership(() => this.id, {
    labelable: true,
    formState: () => this.#context.formState(),
  });
  /**
   * False until the first render of an Input that hydrates (its server element carries a `value`
   * attribute when it is created): `input` events before then aren't checked; the first render
   * takes the element's text instead, unless a composition is open, whose end checks it.
   */
  #rendered = !isPlatformBrowser(inject(PLATFORM_ID)) || !this.#element.hasAttribute("value");
  /** The selection at the edit's `beforeinput`, restored with the text if the edit is undone. */
  #selection: InputSelection | null = null;
  /** The Input is inserting a code with the browser's insertion, whose `beforeinput` stays native. */
  #inserting = false;
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
  /** The last primary `pointerdown` on the Input, which its next `click` consumes. */
  #press: Press | null = null;
  /** The code the last accepted edit wrote, until the next sync after render. */
  #editedValue: string | null = null;
  /** The value the last sync after render found; null before the first. */
  #shown: string | null = null;

  /** @internal The value, the server's `value` attribute. */
  protected readonly value = this.#context.value;
  /** @internal */
  protected readonly type = computed(() => {
    if (this.#context.mask()) {
      return "password";
    }

    return "text";
  });
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
    // The text that hydration didn't check: digits typed before the block hydrated, or the
    // server's own value. A composition still open then, which Angular hasn't replayed yet, is
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

      if (this.#element.value === this.#context.value()) {
        return;
      }

      this.#check();
    });

    // After every render the element shows the value: one the application wrote is written to
    // the property where it differs, since the `value` attribute stops showing once the user has
    // edited. A value that changed without an edit also moves a focused Input's caret to its end,
    // as writing it does: where the attribute showed it, Chromium left the caret at the start.
    // Nothing before a hydrating Input's first render, which keeps the server's value or what the
    // user typed until it is taken, and nothing during a composition, whose text is checked when
    // it ends. Then the cells mirror the selection and focus.
    afterEveryRender(() => {
      if (!this.#rendered || this.#composing) {
        return;
      }

      const value = this.#context.value();
      let moved = this.#shown !== null && this.#shown !== value && value !== this.#editedValue;

      this.#shown = value;
      this.#editedValue = null;

      if (this.#element.value !== value) {
        this.#element.value = value;
        moved = true;
      }

      if (moved && this.#element.matches(":focus")) {
        this.#element.setSelectionRange(value.length, value.length);
      }

      this.mirror();
    });
  }

  /** @internal Joins the nearest Field and registers with the root once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
    this.#context.registerInput({ element: this.#element }, this.#destroyRef);
  }

  /**
   * @internal Records the selection an undone edit restores, and settles a typed insertion before
   * the browser applies it, which keeps its undo history: one whose text wouldn't leave a code is
   * cancelled, and one typed in another form inserts its digits instead, or nothing. A composition,
   * a replayed edit, the Input's own insertion and edits that can't be cancelled stay native, for
   * the check on `input`.
   */
  protected beforeInput(event: Event): void {
    if (replayed(event) || this.#composing || (event instanceof InputEvent && event.isComposing)) {
      return;
    }

    this.#composedText = null;
    this.#selection = selectionOf(this.#element);

    if (
      this.#inserting ||
      !(event instanceof InputEvent) ||
      event.inputType !== "insertText" ||
      event.data === null ||
      !event.cancelable
    ) {
      return;
    }

    const text = this.#element.value;
    const start = this.#selection.start ?? text.length;
    const end = this.#selection.end ?? text.length;
    const data = normalizeCode(event.data);
    const accepted = this.#context.accepts(
      normalizeCode(text.slice(0, start) + data + text.slice(end)),
    );

    if (accepted && data === event.data) {
      return;
    }

    event.preventDefault();
    this.#selection = null;

    if (accepted && data !== "") {
      this.#insert(data);
    }
  }

  /**
   * @internal Checks the edit the browser applied, unless it is part of a composition, including
   * the `input` after a composition's end that leaves the text its end was checked with, or a
   * replay of an edit the first render already took or restored.
   */
  protected edited(event: Event): void {
    if (replayed(event) || this.#composing || (event instanceof InputEvent && event.isComposing)) {
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
   * A replayed end is older than anything genuine: the
   * first render already took its text.
   */
  protected compositionEnd(event: Event): void {
    if (replayed(event)) {
      return;
    }

    this.#composing = false;

    if (this.#composedText === this.#element.value) {
      return;
    }

    this.#check();
    this.#composedText = this.#element.value;
  }

  /**
   * @internal Inserts the clipboard's text, read as a code, with the browser's own insertion, so
   * undo keeps working: a whole code replaces the text, a shorter one goes at the selection if
   * the result fits; anything else does nothing.
   */
  protected pasted(event: ClipboardEvent): void {
    // A replayed paste's default already happened, and Angular throws on preventing it.
    if (replayed(event) || this.#context.readonly() || this.#context.disabled()) {
      return;
    }

    event.preventDefault();

    const code = normalizeCode(event.clipboardData?.getData("text/plain") ?? "");

    if (code === "" || !this.#context.accepts(code)) {
      return;
    }

    const length = this.#context.length();

    if (code.length === length) {
      this.#element.select();
    }

    const text = this.#element.value.length;
    const start = this.#element.selectionStart ?? text;
    const end = this.#element.selectionEnd ?? text;

    if (text - (end - start) + code.length > length) {
      return;
    }

    // Its `input` runs the ordinary check, which commits the code once.
    this.#insert(code);
  }

  /** @internal Remembers where a primary pointer went down, for the `click` that follows. */
  protected pointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) {
      this.#press = null;

      return;
    }

    this.#press = { x: event.clientX, y: event.clientY };
  }

  /**
   * @internal A primary single press collapses an existing selection to its end before the
   * browser handles it: WebKit otherwise collapses that selection after the `click`, over the
   * cell the click selected.
   */
  protected mouseDown(event: MouseEvent): void {
    if (replayed(event) || event.button !== 0 || event.detail !== 1 || modified(event)) {
      return;
    }

    const start = this.#element.selectionStart;
    const end = this.#element.selectionEnd;

    if (start !== null && end !== null && start !== end) {
      this.#element.setSelectionRange(end, end);
    }
  }

  /**
   * @internal A primary, unmodified single click that stayed near its press selects the clicked
   * cell's digit, or puts the caret at the end of the code on an empty cell. The cells are equal
   * slots of the Input's width.
   */
  protected clicked(event: MouseEvent): void {
    const press = this.#press;

    this.#press = null;

    if (
      replayed(event) ||
      press === null ||
      event.button !== 0 ||
      event.detail !== 1 ||
      modified(event) ||
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP
    ) {
      return;
    }

    const bounds = this.#element.getBoundingClientRect();
    const length = this.#context.length();

    if (bounds.width <= 0) {
      return;
    }

    const slot = Math.floor((event.clientX - bounds.left) / (bounds.width / length));
    const text = this.#element.value.length;
    const index = Math.min(Math.max(slot, 0), length - 1, text);
    let end = index;

    if (index < text) {
      end = index + 1;
    }

    this.#element.setSelectionRange(index, end);
    this.mirror();
  }

  /** @internal A double-click selects the whole code. */
  protected doubleClicked(event: MouseEvent): void {
    if (replayed(event)) {
      return;
    }

    this.#element.select();
    this.mirror();
  }

  /** @internal The document's selection changed: mirror it while the Input has focus. */
  protected selectionChanged(): void {
    if (this.#document.activeElement === this.#element) {
      this.mirror();
    }
  }

  /** @internal The element's selection and focus, which the cells mirror. */
  protected mirror(): void {
    this.#mirrorAs(this.#document.activeElement === this.#element);
  }

  /** @internal Focus left the Input. */
  protected left(): void {
    this.#mirrorAs(false);
    this.#context.left();
  }

  #mirrorAs(focused: boolean): void {
    const start = this.#element.selectionStart;
    const end = this.#element.selectionEnd;

    if (start === null || end === null) {
      this.#context.mirror(null, focused);

      return;
    }

    this.#context.mirror({ start, end }, focused);
  }

  /**
   * Inserts `code` at the selection with the browser's own insertion, so undo keeps working; its
   * `beforeinput` stays native and its `input` runs the ordinary check.
   */
  #insert(code: string): void {
    this.#inserting = true;

    try {
      this.#document.execCommand("insertText", false, code);
    } finally {
      this.#inserting = false;
    }
  }

  /**
   * Takes the element's text as an edit if, read as a code, it is accepted: written back in that
   * form, with the caret after the same digits, and committed; else puts the value and the
   * selection before the edit back. Before the first render of a hydrating Input, nothing.
   */
  #check(): void {
    if (!this.#rendered) {
      return;
    }

    const text = this.#element.value;
    const selection = this.#selection;

    this.#selection = null;

    const code = normalizeCode(text);

    if (this.#context.accepts(code)) {
      if (code !== text) {
        const caret = normalizeCode(text.slice(0, this.#element.selectionEnd ?? text.length));

        this.#element.value = code;
        this.#element.setSelectionRange(caret.length, caret.length);
      }

      this.#editedValue = code;
      this.#context.edit(code);
      this.mirror();

      return;
    }

    const value = this.#context.value();

    this.#element.value = value;

    if (selection === null) {
      this.#element.setSelectionRange(value.length, value.length);
    } else {
      this.#element.setSelectionRange(selection.start, selection.end, selection.direction);
    }

    this.mirror();
  }
}

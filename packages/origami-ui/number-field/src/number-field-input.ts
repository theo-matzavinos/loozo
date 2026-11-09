import {
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
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { EventPhase } from "@angular/core/primitives/event-dispatch";
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
 * Whether Angular is replaying an event that reached the server-rendered Input before it
 * hydrated. Its edit is already in the element's text, which the Input's first render adopted or
 * restored, so a replayed edit isn't another edit, and a replayed composition event only opens or
 * closes the composition, whose end is checked only if it is genuine. Eager hydration's replay
 * marks the event `EventPhase.REPLAY`; incremental hydration's calls the listeners with the
 * browser's event after its dispatch has ended, when its phase is `NONE`.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE;
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
 * `beforeinput`, `input` and composition events doesn't edit again. A composition that started
 * before the block hydrated and ends after it is checked when it ends, and its text is kept
 * until then.
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
    "(compositionstart)": "compositionStart()",
    "(compositionend)": "compositionEnd($event)",
    "(keydown)": "keydown($event)",
    "(blur)": "left()",
  },
})
export class OrigamiNumberFieldInput {
  readonly #context = inject(NumberFieldContext);
  readonly #element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);

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
   * takes the element's text instead, and the edits Angular replays afterwards aren't parsed.
   */
  #rendered = !isPlatformBrowser(inject(PLATFORM_ID)) || !this.#element.hasAttribute("value");
  /** The selection at the edit's `beforeinput`, restored with the text if the edit is undone. */
  #selection: InputSelection | null = null;
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
    // server's own text.
    afterNextRender(() => {
      if (this.#rendered) {
        return;
      }

      this.#rendered = true;

      const text = this.#element.value;

      if (text === this.#context.text()) {
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
    // composition, whose text is checked when it ends.
    afterEveryRender(() => {
      if (!this.#rendered || this.#composing) {
        return;
      }

      const text = this.#context.text();
      const steps = this.#context.steps();
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
   * replay of an edit the first render already took.
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
   * @internal A composition started: its edits are checked when it ends. A replayed start opens
   * the composition too, so one that ends after hydration is checked, and kept until then.
   */
  protected compositionStart(): void {
    this.#composing = true;
    this.#composedText = null;
    this.#selection = selectionOf(this.#element);
  }

  /**
   * @internal A composition ended: its text is checked once, its trailing `input` included. A
   * replayed end only closes it: the first render took the text it left.
   */
  protected compositionEnd(event: Event): void {
    if (!this.#composing) {
      return;
    }

    this.#composing = false;

    if (replayed(event)) {
      this.#selection = null;

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

  /**
   * Takes the element's text as an edit if the grammar accepts it, else puts the draft's text and
   * the selection before the edit back. Before the first render of a hydrating Input, nothing.
   */
  #check(): void {
    if (!this.#rendered) {
      return;
    }

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

import {
  DestroyRef,
  Service,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { EventPhase } from "@angular/core/primitives/event-dispatch";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";
import { NumberFieldDraft } from "./number-field-draft";
import { OrigamiNumberFieldOptions } from "./number-field-options";
import { acceptsNumberText, numberSyntax, parseNumberText } from "./number-format";
import type { NumberSyntax } from "./number-format";
import { stepNumber } from "./number-step";

/** The mounted Input, registered from its `ngOnInit`. */
export interface NumberFieldInputRegistration {
  readonly element: HTMLInputElement;
  /** Its effective DOM ID, which the step buttons' `aria-controls` names. */
  readonly id: string;
}

/**
 * @internal A number field root's private behavior: the format and grammar, the text's edits,
 * stepping, the Input registration, `focus()` and the touch notification. Provided by each root;
 * it reads the root's Signal Forms binding (`FORM_FIELD` on the root's element).
 */
@Service({ autoProvided: false })
export class NumberFieldContext {
  readonly #options = injectDeferred(OrigamiNumberFieldOptions);
  readonly #draftResolver = injectDeferred(NumberFieldDraft);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #destroyRef = inject(DestroyRef);
  readonly #input = signal<NumberFieldInputRegistration | null>(null);
  readonly #touches = new Subject<void>();
  /** A `focus()` made before the Input was mounted; applied after the render that mounts it. */
  readonly #request = signal<{ readonly options: FocusOptions | undefined } | null>(null);
  readonly #steps = signal(0);
  /**
   * Whether the root's first render in the browser is done: Signal Forms' binding on the root's
   * element is set only then, and a write before it, from an event Angular replays while it
   * hydrates the root, fails (NG0950). Steps and departures from the Input that arrive earlier
   * wait for it, in the order they arrived.
   */
  #rendered = false;
  #pending: ("up" | "down" | "left")[] = [];

  /** The formatter and grammar of the root's locale and format Options. */
  readonly syntax = computed<NumberSyntax>(() => {
    const options = this.#options();

    return numberSyntax({
      locale: options.locale(),
      minimumFractionDigits: options.minimumFractionDigits(),
      maximumFractionDigits: options.maximumFractionDigits(),
      useGrouping: options.useGrouping(),
    });
  });
  readonly value = computed(() => this.#options().value());
  readonly disabled = computed(() => this.#options().disabled());
  readonly readonly = computed(() => this.#options().readonly());
  readonly parseErrors = computed(() => this.#draft().parseErrors());
  /** The Input's text: the draft. */
  readonly text = computed(() => this.#draft().value());
  /** `"decimal"` while the text accepts fraction digits, else `"numeric"`. */
  readonly inputMode = computed(() => {
    if (this.syntax().maximumFractionDigits > 0) {
      return "decimal";
    }

    return "numeric";
  });
  /** The mounted Input, or null. */
  readonly input = this.#input.asReadonly();
  /** Emits synchronously when focus leaves the Input; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();
  /** The number of steps that wrote a value; the Input moves its caret to the end after each. */
  readonly steps = this.#steps.asReadonly();

  readonly #range = computed(() => {
    const options = this.#options();

    return { min: options.min(), max: options.max(), step: options.step() };
  });
  readonly #editable = computed(() => !this.disabled() && !this.readonly());
  readonly #canStepUp = computed(
    () => this.#editable() && stepNumber(this.value(), 1, this.#range()) !== null,
  );
  readonly #canStepDown = computed(
    () => this.#editable() && stepNumber(this.value(), -1, this.#range()) !== null,
  );

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#touches.complete();
    });

    // A change of the format shows the value again in it: the text refreshes and its parse errors
    // clear; nothing is written. A view effect of the root's view, as the date field's: it tracks
    // only the syntax and writes untracked, so its own write can't rerun it. The first run only
    // records it, so text replayed at hydration stays.
    let shown: NumberSyntax | null = null;

    effect(() => {
      const syntax = this.syntax();

      untracked(() => {
        const previous = shown;

        shown = syntax;

        if (previous === null || previous === syntax) {
          return;
        }

        this.#draft().refresh();
      });
    });

    // Browser-only: render callbacks never run on the server. The read phase runs after every
    // view's default-phase callbacks of the same render, so a hydrating Input has taken the text
    // typed before hydration (its `afterNextRender`) when the steps and departures that waited
    // apply to it.
    afterNextRender({
      read: () => {
        this.#rendered = true;

        const pending = this.#pending;

        this.#pending = [];

        for (const action of pending) {
          // A `touch` listener, or a value write's, may destroy the root: what is left would
          // write into a replacement owner of the value.
          if (this.#destroyRef.destroyed) {
            return;
          }

          if (action === "left") {
            this.left();
          } else if (action === "up") {
            this.step(1);
          } else {
            this.step(-1);
          }
        }
      },
    });

    afterRenderEffect(() => {
      const request = this.#request();
      const input = this.#input();

      if (request === null || input === null) {
        return;
      }

      untracked(() => {
        this.#request.set(null);

        if (!this.disabled()) {
          input.element.focus(request.options);
        }
      });
    });
  }

  /** The Signal Forms state bound on the root's element, or null without `[formField]`. */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /** Whether a step in `direction` would write: editable, a valid step, not past the bound. */
  canStep(direction: 1 | -1): boolean {
    if (direction === 1) {
      return this.#canStepUp();
    }

    return this.#canStepDown();
  }

  /** Registers the Input from its `ngOnInit`, unless its view is already destroyed; a second fails. */
  registerInput(input: NumberFieldInputRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (untracked(this.#input) !== null) {
      throw new Error("Number field supports only one mounted Input.");
    }

    this.#input.set(input);
    destroyRef.onDestroy(() => {
      if (untracked(this.#input) === input) {
        this.#input.set(null);
      }
    });
  }

  /** Whether an edit may leave `text` in the Input: a prefix of the grammar. */
  accepts(text: string): boolean {
    return acceptsNumberText(this.syntax(), text);
  }

  /**
   * An accepted edit: the Input's text becomes the draft, which parses it, also when it equals
   * the draft's text (`1,23` typed over a programmatic 1.234 shown as `1,23` commits 1.23).
   */
  edit(text: string): void {
    this.#draft().value.set(text);
  }

  /**
   * Steps up (+1) or down (−1) from the committed value, a draft with a parse error included,
   * whose text the written value replaces; nothing while disabled or readonly, past the bound or
   * with a step that isn't positive, or once the root is destroyed. Before the root's first render
   * in the browser, the step waits for it.
   */
  step(direction: 1 | -1): void {
    if (this.#destroyRef.destroyed) {
      return;
    }

    if (!this.#rendered) {
      if (direction === 1) {
        this.#pending.push("up");
      } else {
        this.#pending.push("down");
      }

      return;
    }

    if (!this.#editable()) {
      return;
    }

    const next = stepNumber(this.value(), direction, this.#range());

    if (next === null) {
      return;
    }

    this.#options().value.set(next);
    this.#steps.update((steps) => steps + 1);
  }

  /**
   * Focus left the Input: a text that parses to a number shows in the format (`1234,5` becomes
   * `1.234,50`) without a write; then the root's `touch`. Nothing once the root is destroyed.
   * Before the root's first render in the browser, it waits for it with the steps.
   */
  left(): void {
    if (this.#destroyRef.destroyed) {
      return;
    }

    if (!this.#rendered) {
      this.#pending.push("left");

      return;
    }

    const draft = this.#draft();
    const parsed = parseNumberText(this.syntax(), draft.value());

    if (typeof parsed.value === "number") {
      draft.refresh();
    }

    this.#touches.next();
  }

  /**
   * A step button's `mousedown`: a primary-button mouse press keeps focus and the selection in the
   * Input, and focuses the Input if it isn't focused. The compatibility `mousedown` a browser fires
   * after a touch or pen press, whose `pointerdown` came first with that `pointerType`, is native.
   * @param pointerType - The `pointerType` of the button's `pointerdown` before this `mousedown`,
   *   or null without one, which counts as a mouse.
   */
  press(event: MouseEvent, pointerType: string | null): void {
    if (event.button !== 0 || pointerType === "touch" || pointerType === "pen") {
      return;
    }

    // A replayed press's default already happened, and Angular throws on preventing it.
    if (event.eventPhase !== EventPhase.REPLAY) {
      event.preventDefault();
    }

    const input = this.#input();

    if (input !== null && !input.element.matches(":focus")) {
      this.focus();
    }
  }

  /**
   * Focuses the Input, passing `options` to its native `focus()`; before the Input is mounted, it
   * takes focus once it renders. Nothing while disabled.
   */
  focus(options?: FocusOptions): void {
    if (this.disabled()) {
      return;
    }

    const input = this.#input();

    if (input === null) {
      this.#request.set({ options });

      return;
    }

    input.element.focus(options);
  }

  #draft(): NumberFieldDraft {
    // Created on first read, outside any reactive context: `transformedValue` writes Signal
    // Forms' parse-error source, which a render `computed` forbids (NG0600).
    return untracked(this.#draftResolver);
  }
}

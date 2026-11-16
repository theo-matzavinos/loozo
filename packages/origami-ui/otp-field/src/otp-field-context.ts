import {
  DestroyRef,
  Service,
  afterNextRender,
  computed,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";
import { acceptsCode, isComplete } from "./otp-code";
import { OrigamiOtpFieldOptions } from "./otp-field-options";
import type { OrigamiOtpFieldCell } from "./otp-field-state";

/** The mounted Input, registered from its `ngOnInit`. */
export interface OtpFieldInputRegistration {
  readonly element: HTMLInputElement;
}

/** The focused Input's selection, which the cells mirror. */
export interface OtpFieldSelection {
  readonly start: number;
  readonly end: number;
}

function sameSelection(a: OtpFieldSelection | null, b: OtpFieldSelection | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  return a.start === b.start && a.end === b.end;
}

/**
 * @internal An OTP field root's private behavior: the code rules, the value's edits, the Input
 * registration, the mirrored selection and focus the cells show, `focus()` and the touch
 * notification. Provided by each root; it reads the root's Signal Forms binding (`FORM_FIELD` on
 * the root's element).
 */
@Service({ autoProvided: false })
export class OtpFieldContext {
  readonly #options = injectDeferred(OrigamiOtpFieldOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #destroyRef = inject(DestroyRef);
  readonly #input = signal<OtpFieldInputRegistration | null>(null);
  readonly #touches = new Subject<void>();
  readonly #selection = signal<OtpFieldSelection | null>(null, { equal: sameSelection });
  readonly #focused = signal(false);
  /**
   * Whether the root's first render in the browser is done: Signal Forms' binding on the root's
   * element is set only then, and its `touch` listener fails before it (NG0950). Departures from
   * the Input that arrive earlier, such as a `blur` Angular replays while it hydrates the root,
   * wait for it.
   */
  #rendered = false;
  #pendingTouches = 0;

  readonly value = computed(() => this.#options().value());
  readonly length = computed(() => this.#options().length());
  readonly mask = computed(() => this.#options().mask());
  readonly disabled = computed(() => this.#options().disabled());
  readonly readonly = computed(() => this.#options().readonly());
  readonly complete = computed(() => isComplete(this.value(), this.length()));
  readonly focused = this.#focused.asReadonly();
  readonly cells = computed<readonly OrigamiOtpFieldCell[]>(() => {
    const value = this.value();
    const length = this.length();
    const mask = this.mask();
    const focused = this.#focused();
    const selection = this.#selection();
    const cells: OrigamiOtpFieldCell[] = [];

    for (let index = 0; index < length; index++) {
      const filled = index < value.length;
      let char: string | null = null;

      if (filled && !mask) {
        char = value.charAt(index);
      }

      let caret = false;
      let selected = false;

      if (focused && selection !== null) {
        if (selection.start === selection.end) {
          caret = selection.start === index;
        } else {
          selected = index >= selection.start && index < selection.end;
        }
      }

      cells.push({ index, char, filled, caret, selected });
    }

    return cells;
  });
  /** The mounted Input, or null. */
  readonly input = this.#input.asReadonly();
  /** Emits synchronously when focus leaves the Input; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#touches.complete();
    });

    // Browser-only: render callbacks never run on the server. The read phase runs after every
    // view's default-phase callbacks of the same render, so a hydrating Input has adopted the text
    // typed before hydration (its `afterNextRender`) before the departures that waited touch.
    afterNextRender({
      read: () => {
        this.#rendered = true;

        let pending = this.#pendingTouches;

        this.#pendingTouches = 0;

        for (; pending > 0; pending--) {
          // A `touch` listener may destroy the root.
          if (this.#destroyRef.destroyed) {
            return;
          }

          this.#touches.next();
        }
      },
    });
  }

  /** The Signal Forms state bound on the root's element, or null without `[formField]`. */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /** Registers the Input from its `ngOnInit`, unless its view is already destroyed; a second fails. */
  registerInput(input: OtpFieldInputRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (untracked(this.#input) !== null) {
      throw new Error("OTP field supports only one mounted Input.");
    }

    this.#input.set(input);
    destroyRef.onDestroy(() => {
      if (untracked(this.#input) !== input) {
        return;
      }

      this.#input.set(null);
      this.#focused.set(false);
      this.#selection.set(null);
    });
  }

  /** Whether an edit may leave `code`, already normalized, in the Input. */
  accepts(code: string): boolean {
    return acceptsCode(code, this.length());
  }

  /**
   * An accepted edit's code: written when it differs from the value, which emits a directive
   * model's `valueChange` synchronously. Nothing once the root is destroyed.
   */
  edit(code: string): void {
    if (this.#destroyRef.destroyed) {
      return;
    }

    const options = this.#options();

    if (untracked(options.value) === code) {
      return;
    }

    options.value.set(code);
  }

  /** The Input's selection and focus, which the cells mirror; only the Input writes them. */
  mirror(selection: OtpFieldSelection | null, focused: boolean): void {
    this.#selection.set(selection);
    this.#focused.set(focused);
  }

  /**
   * Focus left the Input: the root's `touch`. Before the root's first render in the browser, it
   * waits for it. Nothing once the root is destroyed.
   */
  left(): void {
    if (this.#destroyRef.destroyed) {
      return;
    }

    if (!this.#rendered) {
      this.#pendingTouches++;

      return;
    }

    this.#touches.next();
  }

  /** Focuses the Input, passing `options` to its native `focus()`; nothing while disabled or with none. */
  focus(options?: FocusOptions): void {
    if (this.disabled()) {
      return;
    }

    this.#input()?.element.focus(options);
  }
}

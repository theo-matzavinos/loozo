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
import { OrigamiFileFieldOptions } from "./file-field-options";

/** The mounted Input, registered from its `ngOnInit`. */
export interface FileFieldInputRegistration {
  readonly element: HTMLInputElement;
  /** Its effective DOM ID. */
  readonly id: string;
}

/**
 * @internal A file field root's private behavior: the selection rule (`select`), the touch
 * notification and its hold until the root's first browser render, the Input registration and
 * `focus()`. Provided by each root; it reads the root's Signal Forms binding (`FORM_FIELD` on the
 * root's element).
 */
@Service({ autoProvided: false })
export class FileFieldContext {
  readonly #options = injectDeferred(OrigamiFileFieldOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #destroyRef = inject(DestroyRef);
  readonly #input = signal<FileFieldInputRegistration | null>(null);
  readonly #touches = new Subject<void>();
  /**
   * Whether the root's first render in the browser is done: Signal Forms' binding on the root's
   * element is set only then, and a touch before it, from a blur during the change detection that
   * creates the root, fails (NG0950). Touches requested earlier are held until it.
   */
  #rendered = false;
  /** A held touch that lasts as long as the root: one that came with a value write. */
  #pendingRoot = false;
  /** The `DestroyRef`s of the Inputs whose blur is held: each lapses if its Input is destroyed. */
  #pendingInputs: DestroyRef[] = [];

  readonly value = computed(() => this.#options().value());
  readonly disabled = computed(() => this.#options().disabled());
  /** Emits synchronously when the field is touched; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#touches.complete();
    });

    // Browser-only: render callbacks never run on the server. The read phase runs after every
    // view's default-phase callbacks of the same render, so a hydrating Input's adoption (its
    // `afterNextRender`) has written its value first. Several held requests collapse into one
    // touch; a held blur whose Input is gone by now reaches no replacement field.
    afterNextRender({
      read: () => {
        this.#rendered = true;

        const root = this.#pendingRoot;
        const inputs = this.#pendingInputs;

        this.#pendingRoot = false;
        this.#pendingInputs = [];

        if (this.#destroyRef.destroyed) {
          return;
        }

        if (root || inputs.some((input) => !input.destroyed)) {
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
  registerInput(input: FileFieldInputRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (untracked(this.#input) !== null) {
      throw new Error("File field supports only one mounted Input.");
    }

    this.#input.set(input);
    destroyRef.onDestroy(() => {
      if (untracked(this.#input) === input) {
        this.#input.set(null);
      }
    });
  }

  /**
   * A user's selection: a genuine pick, a drop or the first-render adoption. Writes `file` unless
   * it is the value already (`Object.is`), then touches if asked, for as long as the root lives:
   * the value it reports is the root's. Nothing while disabled or once the root is destroyed.
   */
  select(file: File | null, { touch }: { readonly touch: boolean }): void {
    if (this.#destroyRef.destroyed || untracked(this.disabled)) {
      return;
    }

    const options = untracked(this.#options);

    if (!Object.is(file, untracked(options.value))) {
      options.value.set(file);
    }

    if (touch) {
      this.touch(null);
    }
  }

  /**
   * Requests the root's `touch`. `input` is the requesting Input's `DestroyRef` (its blur), or
   * null for a request that lasts as long as the root. After the root's first browser render it
   * emits at once; before it, the request is held until that render's read phase. Nothing once
   * the root is destroyed.
   */
  touch(input: DestroyRef | null): void {
    if (this.#destroyRef.destroyed) {
      return;
    }

    if (!this.#rendered) {
      if (input === null) {
        this.#pendingRoot = true;
      } else {
        this.#pendingInputs.push(input);
      }

      return;
    }

    this.#touches.next();
  }

  /**
   * Focuses the mounted Input, passing `options` to its native `focus()`; nothing without one or
   * while disabled.
   */
  focus(options?: FocusOptions): void {
    const input = untracked(this.#input);

    if (input === null || untracked(this.disabled)) {
      return;
    }

    input.element.focus(options);
  }
}

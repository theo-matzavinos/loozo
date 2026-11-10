import {
  DestroyRef,
  Service,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from "@angular/core";
import type { Provider, Signal, WritableSignal } from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import {
  ɵOrigamiListbox,
  ɵmoveActiveOption,
  ɵrequestSingleSelection,
} from "@loozo/origami-ui/collection";
import type { ɵActiveOptionMove, ɵOrigamiListboxOption } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";

/** The values a Combobox and its options carry, compared with `===`. */
export type ComboboxValue = string | number | boolean;

/** What an Option registers from its `ngOnInit`; every signal reads its effective Options. */
export interface ComboboxOptionRegistration extends ɵOrigamiListboxOption {
  readonly value: Signal<ComboboxValue>;
  readonly label: Signal<string | null>;
}

/** What Content registers from its `ngOnInit`. */
export interface ComboboxContentRegistration {
  /** Its composed Popover's native participation. */
  readonly participating: Signal<boolean>;
  /** Its effective ID, which the input's `aria-controls` names. */
  readonly id: Signal<string>;
}

/** What the input registers from its `ngOnInit`. */
export interface ComboboxInputRegistration {
  readonly element: HTMLInputElement;
  /** Its Field's Label IDs while it is the Field's control, else its static `aria-labelledby`. */
  readonly labelledBy: Signal<string | null>;
  /** Its template's static `aria-label`, or null; a bound one isn't read. */
  readonly label: string | null;
  /** Whether an IME composition runs in it. */
  readonly composing: Signal<boolean>;
}

/** Where an opening key puts the active option: the selected one, else an end, or nothing. */
export type ComboboxOpenTarget = "first" | "last" | "none";

/**
 * The root's effective Options as the Context reads them; the root provides it from its public
 * Options token.
 */
export abstract class ComboboxRootOptions {
  /** The chosen value; null chooses nothing. */
  abstract readonly value: WritableSignal<ComboboxValue | null>;
  /** The input's text. */
  abstract readonly query: WritableSignal<string>;
  /** Requested open state, which the composed Popover root also reads and writes. */
  abstract readonly open: WritableSignal<boolean>;
  /** Blocks opening, editing and choosing. */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Provides the Context's view of the root Options.
   * @param factory - Runs in the root's injection context the first time the Context reads it.
   * @returns A local provider.
   */
  static provideFactory(factory: () => ComboboxRootOptions): Provider {
    return { provide: ComboboxRootOptions, useFactory: factory };
  }
}

/**
 * An option's label: its explicit `label`, else its text with whitespace collapsed, read when it
 * is chosen.
 */
function optionLabel(option: ComboboxOptionRegistration): string {
  const label = option.label();

  if (label !== null) {
    return label;
  }

  return (option.element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @internal The Combobox's private owner: its text and value policy over the shared listbox core
 * (`ɵOrigamiListbox` from /collection, which holds the option registrations, the active option
 * and the pending reveal). Focus stays on the input; the active option is only highlighted
 * (`aria-activedescendant`). It keeps three facts apart: the query (the input's text), the active
 * option and the value, plus a private committed text that a close without a choice restores.
 * It also owns the registered input and Content and the root's Signal Forms binding
 * (`FORM_FIELD` on the root's element).
 */
@Service({ autoProvided: false })
export class ComboboxContext {
  readonly #root = injectDeferred(ComboboxRootOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #touches = new Subject<void>();
  readonly #content = signal<ComboboxContentRegistration | null>(null);
  readonly #input = signal<ComboboxInputRegistration | null>(null);
  #destroyed = false;
  /** Whether the list participated since the last user open, so losing participation clears. */
  #participated = false;
  /** The query this Context is writing, so the committed text doesn't take it for an outside write. */
  #writing: string | null = null;
  /**
   * Whether a session is pending, which the next requested close ends with the cleanup (the
   * committed text, no active option): set by every opening and close the Combobox makes itself
   * (an edit, an opening key, a key in the open list, the Trigger's click, a close without a
   * choice) and by any requested open the cleanup effect sees; cleared by the cleanup, which a
   * choice also runs. Set by the event itself, so a request the consumer cancels before any effect
   * runs, such as from `openChange` or a microtask, still ends with the cleanup. Draft adoption
   * never sets it.
   */
  readonly #sessionPending = signal(false);

  /**
   * The text a close without a choice restores: a chosen option's label, `""` once the input is
   * emptied, and every query written from outside, such as the initial one.
   */
  readonly #committed = linkedSignal<string, string>({
    source: () => this.#root().query(),
    computation: (query, previous) => {
      if (previous !== undefined && query === this.#writing) {
        return previous.value;
      }

      return query;
    },
  });

  /** Requested open state. */
  readonly open = computed(() => this.#root().open());
  readonly disabled = computed(() => this.#root().disabled());
  /**
   * The root's query, read from its own signal rather than through a memo, so a reader also reruns
   * after a write that restores the text it last read.
   */
  readonly query = (): string => this.#root().query();
  /** The registered Content's native participation; false without Content. */
  readonly participating = computed(() => this.#content()?.participating() ?? false);
  /** The registered Content's ID, while Content is mounted. */
  readonly contentId = computed(() => this.#content()?.id() ?? null);
  readonly #listbox = new ɵOrigamiListbox<ComboboxOptionRegistration>(this.participating);
  /** The highlighted option while it is registered; never the value. */
  readonly active = this.#listbox.active;
  /** The active option while the list participates: what the input and the options expose. */
  readonly highlighted = this.#listbox.highlighted;
  /** The input's `aria-activedescendant`: the highlighted option's ID. */
  readonly activeDescendant = this.#listbox.activeDescendant;
  /** The registered input element, for the composed Popover's presentation and focus restore. */
  readonly inputElement = computed(() => this.#input()?.element ?? null);
  /** The registered input's `aria-labelledby`, null until it registers and while it has none. */
  readonly labelledBy = computed(() => this.#input()?.labelledBy() ?? null);
  /** The registered input's static `aria-label`, null until it registers and while it has none. */
  readonly inputLabel = computed(() => this.#input()?.label ?? null);
  /** Emits synchronously when focus leaves the input; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });

    // The cleanup runs whenever the requested state is closed while a session is pending, whether
    // or not this effect saw it open; a requested open it sees starts one. The pending session is
    // always read, so clearing it while the list stays open, as a choice the consumer reopens
    // does, reruns this.
    effect(() => {
      const pending = this.#sessionPending();

      if (this.open()) {
        if (!pending) {
          untracked(() => this.#sessionPending.set(true));
        }
      } else if (pending) {
        untracked(() => this.#endSession());
      }
    });

    // Losing participation while the request stays open, such as by an enclosing layer's close,
    // also clears the active option. A user open starts again before participation, as its
    // opening frame sets the active option.
    effect(() => {
      const participating = this.participating();
      const lost = this.#participated && !participating;

      this.#participated = participating;

      if (lost) {
        untracked(() => this.#listbox.activate(null));
      }
    });

    // Disabling an open Combobox closes it; an open write while disabled stays authoritative.
    let wasDisabled: boolean | null = null;

    effect(() => {
      const disabled = this.disabled();

      if (wasDisabled === false && disabled) {
        untracked(() => this.#root().open.set(false));
      }

      wasDisabled = disabled;
    });
  }

  /** Registers an Option from its `ngOnInit`, unless its view is already destroyed; `destroyRef` removes it. */
  registerOption(option: ComboboxOptionRegistration, destroyRef: DestroyRef): void {
    this.#listbox.register(option, destroyRef);
  }

  /** Registers Content from its `ngOnInit`; its composed Popover Content rejects a second one first. */
  registerContent(content: ComboboxContentRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#content.set(content);
    destroyRef.onDestroy(() => {
      if (this.#content() === content) {
        this.#content.set(null);
      }
    });
  }

  /** Registers the input from its `ngOnInit`; its composed Popover Anchor rejects a second one first. */
  registerInput(input: ComboboxInputRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#input.set(input);
    destroyRef.onDestroy(() => {
      if (this.#input() === input) {
        this.#input.set(null);
      }
    });
  }

  /**
   * The Signal Forms state bound on the root's element, or null without `[formField]`; read only
   * after the parts' `ngOnInit`, once Angular has set that binding.
   */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /** Focuses the registered input; nothing while none is registered. */
  focus(options?: FocusOptions): void {
    this.#input()?.element.focus(options);
  }

  /**
   * Focus left the input, and the root reports `touch`. Focus moving to another element also
   * closes the list without a choice, also when it is already closed, so an adopted draft reverts;
   * focus falling to nothing (another window, a script `blur()`) keeps it open with its text.
   * @param moved - Whether focus moved to another element: the blur's `relatedTarget` is one.
   */
  left(moved: boolean): void {
    if (moved) {
      this.close();
    }

    this.#touches.next();
  }

  /** Whether `value` is the root's value; tracked. */
  selected(value: ComboboxValue): boolean {
    return this.#root().value() === value;
  }

  /**
   * The user edited the input's text: it becomes the query, the active option clears, an emptied
   * input clears the value and the committed text, the list opens, and a session is pending, so
   * the next close without a choice reverts, also when that open is cancelled at once.
   */
  edited(text: string): void {
    if (this.#destroyed) {
      return;
    }

    this.#listbox.activate(null);
    this.#sessionPending.set(true);

    // Committed before the write, so a query the consumer writes from `queryChange` stays the
    // committed text.
    if (text === "") {
      this.#committed.set("");
    }

    this.#writeQuery(text);

    if (text === "") {
      const value = this.#root().value;

      if (value() !== null) {
        value.set(null);
      }
    }

    if (!this.disabled() && !this.open()) {
      this.#participated = false;
      this.#root().open.set(true);
    }
  }

  /**
   * Text typed into the server's input before hydration becomes the query, without choosing,
   * committing, opening or a pending session, so the closed list keeps it until a close.
   */
  adopt(text: string): void {
    this.#writeQuery(text);
  }

  /**
   * An opening key: opens and puts the active option on the selected one, else on `target`; a
   * session is pending, so a close, also one the consumer makes at once, clears it again.
   */
  openAt(target: ComboboxOpenTarget): void {
    if (this.#destroyed || this.disabled()) {
      return;
    }

    this.#participated = false;
    this.#sessionPending.set(true);
    this.#root().open.set(true);

    if (target === "none") {
      this.#listbox.activate(null);

      return;
    }

    this.#listbox.activate(
      this.#selectedOption() ?? ɵmoveActiveOption(this.#listbox.ordered(), null, target),
    );
  }

  /**
   * A key in the open list moves the active option; without one, Arrow keys start from the
   * selected option, else an end. A session is pending, so the next close clears it.
   */
  move(move: ɵActiveOptionMove): void {
    this.#sessionPending.set(true);

    if (this.active() === null && (move === "next" || move === "previous")) {
      const selected = this.#selectedOption();

      if (selected !== null) {
        this.#listbox.activate(selected);

        return;
      }
    }

    this.#listbox.move(move);
  }

  /** A pointer moved over an option: it becomes active, without scrolling. Disabled options don't. */
  point(option: ComboboxOptionRegistration): void {
    this.#listbox.point(option);
  }

  /**
   * Scrolls each keyboard activation into view inside Content; Content calls it once, from its
   * constructor.
   * @param content - Content's element.
   * @param ready - Reads its floating presentation's readiness, reactively.
   */
  scrollReveals(content: HTMLElement, ready: () => boolean): void {
    this.#listbox.scrollReveals(content, ready);
  }

  /**
   * A user's choice of `option`: writes its value (only a change) and shows and commits its label,
   * then closes and ends the session at once, so nothing reverts the label. Dropped, writing
   * nothing and leaving the list open, while the Combobox is disabled, the `[formField]` on the
   * root's element is readonly, the option is disabled or an IME composition runs in the input.
   */
  choose(option: ComboboxOptionRegistration): void {
    if (
      this.#destroyed ||
      this.disabled() ||
      (this.formState()?.readonly() ?? false) ||
      option.disabled() ||
      (this.#input()?.composing() ?? false)
    ) {
      return;
    }

    const label = optionLabel(option);

    ɵrequestSingleSelection(this.#root().value, option.value(), true, false);
    // Committed before the write, so a query the consumer writes from `queryChange` stays the
    // committed text, which the close then leaves in place.
    this.#committed.set(label);
    this.#writeQuery(label);
    this.#root().open.set(false);
    this.#endSession();
  }

  /**
   * The Trigger toggled the list, from its click, in the task of the composed Popover Trigger's
   * own write: a session is pending, so an open the consumer cancels at once still ends with the
   * cleanup.
   */
  toggled(): void {
    if (!this.#destroyed) {
      this.#sessionPending.set(true);
    }
  }

  /**
   * Closes without a choice, also when already closed: the session is pending, so the cleanup
   * writes the committed text back and clears the active option.
   */
  close(): void {
    if (!this.#destroyed) {
      this.#sessionPending.set(true);
      this.#root().open.set(false);
    }
  }

  /**
   * Ends the session: writes the committed text to the query (an equal one writes nothing, and
   * during a composition the input holds its text, as for every query write) and clears the
   * active option with its pending scroll.
   */
  #endSession(): void {
    this.#sessionPending.set(false);
    this.#listbox.activate(null);
    this.#writeQuery(this.#committed());
  }

  /**
   * Writes the query as this Context's own write, so the committed text keeps its value; any
   * outside write still pending is taken first.
   */
  #writeQuery(text: string): void {
    untracked(() => {
      this.#committed();
      this.#writing = text;
      this.#root().query.set(text);
      this.#committed();
      this.#writing = null;
    });
  }

  /** The first enabled option, in DOM order, whose value is the root's value. */
  #selectedOption(): ComboboxOptionRegistration | null {
    for (const option of this.#listbox.ordered()) {
      if (!option.disabled() && this.selected(option.value())) {
        return option;
      }
    }

    return null;
  }
}

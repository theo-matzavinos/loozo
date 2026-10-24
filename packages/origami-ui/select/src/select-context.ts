import { DestroyRef, Service, computed, effect, inject, signal, untracked } from "@angular/core";
import type { Provider, Signal, WritableSignal } from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";
import { TypeaheadBuffer, matchTypeahead, moveActiveOption } from "./active-option";
import type { ActiveOptionMove } from "./active-option";

/** The values a Select and its options carry, compared with `===`. */
export type SelectValue = string | number | boolean;

/** What an Option registers from its `ngOnInit`; every signal reads its effective Options. */
export interface SelectOptionRegistration {
  readonly element: HTMLElement;
  readonly id: Signal<string>;
  readonly value: Signal<SelectValue>;
  readonly disabled: Signal<boolean>;
  readonly label: Signal<string | null>;
}

/** What Content registers from its `ngOnInit`. */
export interface SelectContentRegistration {
  /** Its composed Popover's native participation. */
  readonly participating: Signal<boolean>;
}

/** What the Trigger registers from its `ngOnInit`. */
export interface SelectTriggerRegistration {
  readonly element: HTMLElement;
  /** Its `aria-labelledby`: the Field's Label IDs while it is the Field's control, else its static value. */
  readonly labelledBy: Signal<string | null>;
}

/** Where opening puts the active option: the selected one (else the first enabled), or an end. */
export type SelectOpenTarget = "selected" | "first" | "last";

/** A keyboard or opening activation that Content scrolls into view; a new object every time. */
export type SelectReveal = { readonly option: SelectOptionRegistration };

/**
 * Configuration of the Select Context, supplied by the root that provides it. The root's mode owns
 * what "selected" means and what choosing an option writes, so a later multiple-selection root can
 * share the Context and its parts.
 */
export abstract class SelectRootOptions {
  /** Requested open state, which the composed Popover root also reads and writes. */
  abstract readonly open: WritableSignal<boolean>;
  /** Blocks opening and choosing. */
  abstract readonly disabled: Signal<boolean>;
  /** Whether nothing is selected: the Trigger's placeholder. */
  abstract readonly empty: Signal<boolean>;
  /** Whether `value` is selected; tracked. */
  abstract selected(value: SelectValue): boolean;
  /** Applies the mode's write rule to a chosen option's value, including whether to close. */
  abstract choose(value: SelectValue): void;

  /**
   * Provides the root Options beside the Context.
   * @param factory - Runs in the root's injection context the first time the Context reads it.
   * @returns A local provider.
   */
  static provideFactory(factory: () => SelectRootOptions): Provider {
    return { provide: SelectRootOptions, useFactory: factory };
  }
}

/** Sort comparator for connected elements in document order; event time only. */
function documentOrder(left: SelectOptionRegistration, right: SelectOptionRegistration): number {
  const position = left.element.compareDocumentPosition(right.element);

  if ((position & 4) !== 0) {
    return -1;
  }

  if ((position & 2) !== 0) {
    return 1;
  }

  return 0;
}

/**
 * Typeahead text: the explicit label, else the element's text with whitespace collapsed, read
 * when the key is pressed.
 */
function typeaheadText(option: SelectOptionRegistration): string {
  const label = option.label();

  if (label !== null) {
    return label;
  }

  return (option.element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * @internal The Select's private owner: option registrations, the active option, typeahead and
 * the guarded choice. Focus stays on the Trigger; the active option is only highlighted
 * (`aria-activedescendant`). Only `choose` writes the value, from a user's choice. It also owns
 * the registered Trigger and the root's Signal Forms binding (`FORM_FIELD` on the root's element).
 */
@Service({ autoProvided: false })
export class SelectContext {
  readonly #root = injectDeferred(SelectRootOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #touches = new Subject<void>();
  readonly #options = signal<readonly SelectOptionRegistration[]>([]);
  readonly #content = signal<SelectContentRegistration | null>(null);
  readonly #trigger = signal<SelectTriggerRegistration | null>(null);
  readonly #active = signal<SelectOptionRegistration | null>(null);
  readonly #reveal = signal<SelectReveal | null>(null);
  readonly #typeahead = new TypeaheadBuffer();
  #destroyed = false;
  /** Whether the list participated since the last user open, so losing participation closes. */
  #participated = false;

  /** Requested open state. */
  readonly open = computed(() => this.#root().open());
  readonly disabled = computed(() => this.#root().disabled());
  readonly empty = computed(() => this.#root().empty());
  /** Registered options in registration order. */
  readonly options = this.#options.asReadonly();
  /** The registered Content's native participation; false without Content. */
  readonly participating = computed(() => this.#content()?.participating() ?? false);
  /** The highlighted option while it is registered; never the value. */
  readonly active = computed(() => {
    const active = this.#active();

    if (active !== null && this.#options().includes(active)) {
      return active;
    }

    return null;
  });
  /** The active option while the list participates: what the Trigger and the options expose. */
  readonly highlighted = computed(() => {
    if (!this.participating()) {
      return null;
    }

    return this.active();
  });
  /** The Trigger's `aria-activedescendant`: the highlighted option's ID. */
  readonly activeDescendant = computed(() => this.highlighted()?.id() ?? null);
  /** The latest activation to scroll into view, or null. */
  readonly reveal = this.#reveal.asReadonly();
  /** The registered Trigger's `aria-labelledby`, null until it registers and while it has none. */
  readonly labelledBy = computed(() => this.#trigger()?.labelledBy() ?? null);
  /** Emits synchronously when focus leaves the Trigger; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
    });

    // The active option and the typeahead buffer never survive a close: neither the requested
    // one nor a lost participation, such as an enclosing layer's close, which keeps the request.
    // A user open starts again before participation, as its opening frame sets the active option.
    effect(() => {
      const participating = this.participating();
      const lost = this.#participated && !participating;

      this.#participated = participating;

      if (!this.open() || lost) {
        untracked(() => {
          this.#active.set(null);
          this.#reveal.set(null);
          this.#typeahead.reset();
        });
      }
    });

    // Disabling an open Select closes it; an open write while disabled stays authoritative.
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
  registerOption(option: SelectOptionRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#options.update((options) => [...options, option]);
    destroyRef.onDestroy(() => {
      this.#options.update((options) => {
        const remaining: SelectOptionRegistration[] = [];

        for (const registered of options) {
          if (registered !== option) {
            remaining.push(registered);
          }
        }

        return remaining;
      });
    });
  }

  /** Registers Content from its `ngOnInit`; its composed Popover Content rejects a second one first. */
  registerContent(content: SelectContentRegistration, destroyRef: DestroyRef): void {
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

  /** Registers the Trigger from its `ngOnInit`; its composed Popover Trigger rejects a second one first. */
  registerTrigger(trigger: SelectTriggerRegistration, destroyRef: DestroyRef): void {
    if (destroyRef.destroyed) {
      return;
    }

    this.#trigger.set(trigger);
    destroyRef.onDestroy(() => {
      if (this.#trigger() === trigger) {
        this.#trigger.set(null);
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

  /** Focuses the registered Trigger; nothing while none is registered. */
  focus(options?: FocusOptions): void {
    this.#trigger()?.element.focus(options);
  }

  /** Focus left the Trigger. */
  left(): void {
    this.#touches.next();
  }

  /** Whether `value` is selected, by the root's mode; tracked. */
  selected(value: SelectValue): boolean {
    return this.#root().selected(value);
  }

  /** A user open request from the Trigger, which has applied its own disabled policy. */
  openAt(target: SelectOpenTarget): void {
    if (!this.#request()) {
      return;
    }

    this.#activate(this.#target(target));
  }

  /**
   * A printable key on the closed Trigger: opens, and the active option is the first enabled
   * option the character starts, else the selected one, else the first enabled one.
   */
  openWithTypeahead(character: string, time: number): void {
    if (!this.#request()) {
      return;
    }

    const search = this.#typeahead.add(character, time);
    const match = matchTypeahead(this.#candidates(), null, search, typeaheadText);

    if (match !== null) {
      this.#activate(match);

      return;
    }

    this.#activate(this.#target("selected"));
  }

  /**
   * The active option after a pointer opened the list: the selected one, else the first enabled
   * one. Called after the Trigger's click opened it.
   */
  opened(): void {
    if (!this.#destroyed && this.open()) {
      this.#typeahead.reset();
      this.#participated = false;
      this.#activate(this.#target("selected"));
    }
  }

  /** Moves the active option; without one, Arrow keys start from the selected option. */
  move(move: ActiveOptionMove): void {
    const active = this.active();

    if (active === null && (move === "next" || move === "previous")) {
      const selected = this.#selectedOption();

      if (selected !== null) {
        this.#activate(selected);

        return;
      }
    }

    const target = moveActiveOption(this.#ordered(), active, move);

    if (target !== null) {
      this.#activate(target);
    }
  }

  /** Whether a typeahead buffer typed before `time` still runs, so a Space joins it. */
  typeaheadRunning(time: number): boolean {
    return this.#typeahead.running(time);
  }

  /** A printable key while open: moves the active option to the next match, if any. */
  typeahead(character: string, time: number): void {
    const search = this.#typeahead.add(character, time);
    const match = matchTypeahead(this.#candidates(), this.active(), search, typeaheadText);

    if (match !== null) {
      this.#activate(match);
    }
  }

  /** A pointer moved over an option: it becomes active, without scrolling. Disabled options don't. */
  point(option: SelectOptionRegistration): void {
    if (!this.#destroyed && this.participating() && !option.disabled()) {
      this.#active.set(option);
    }
  }

  /**
   * A user's choice of `option`, else of the active option: dropped while the Select is disabled,
   * the `[formField]` on the root's element is readonly or the option is disabled. Without an
   * option to choose, it closes without writing.
   */
  choose(option: SelectOptionRegistration | null = this.active()): void {
    if (this.#destroyed || this.disabled() || (this.formState()?.readonly() ?? false)) {
      return;
    }

    if (option === null) {
      this.close();

      return;
    }

    if (!option.disabled()) {
      this.#root().choose(option.value());
    }
  }

  /** Closes without writing the value: Tab. */
  close(): void {
    if (!this.#destroyed) {
      this.#root().open.set(false);
    }
  }

  /**
   * Writes the open request with a fresh typeahead search and opening frame; false when the Select
   * can't open.
   */
  #request(): boolean {
    if (this.#destroyed || this.disabled()) {
      return false;
    }

    this.#typeahead.reset();
    this.#participated = false;
    this.#root().open.set(true);

    return true;
  }

  #activate(option: SelectOptionRegistration | null): void {
    this.#active.set(option);

    if (option === null) {
      this.#reveal.set(null);

      return;
    }

    this.#reveal.set({ option });
  }

  #target(target: SelectOpenTarget): SelectOptionRegistration | null {
    if (target === "selected") {
      const selected = this.#selectedOption();

      if (selected !== null) {
        return selected;
      }

      return moveActiveOption(this.#ordered(), null, "first");
    }

    return moveActiveOption(this.#ordered(), null, target);
  }

  /** The first enabled selected option in DOM order. */
  #selectedOption(): SelectOptionRegistration | null {
    for (const option of this.#ordered()) {
      if (!option.disabled() && this.selected(option.value())) {
        return option;
      }
    }

    return null;
  }

  /** Registered options in current DOM order. */
  #ordered(): SelectOptionRegistration[] {
    return [...this.#options()].sort(documentOrder);
  }

  /** Enabled options in current DOM order. */
  #candidates(): SelectOptionRegistration[] {
    const candidates: SelectOptionRegistration[] = [];

    for (const option of this.#ordered()) {
      if (!option.disabled()) {
        candidates.push(option);
      }
    }

    return candidates;
  }
}

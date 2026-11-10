import { DestroyRef, Service, computed, effect, inject, signal, untracked } from "@angular/core";
import type { Provider, Signal, WritableSignal } from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import {
  ɵOrigamiListbox,
  ɵTypeaheadBuffer,
  ɵmatchTypeahead,
  ɵmoveActiveOption,
} from "@loozo/origami-ui/collection";
import type { ɵActiveOptionMove, ɵOrigamiListboxOption } from "@loozo/origami-ui/collection";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";

/** The values a Select and its options carry, compared with `===`. */
export type SelectValue = string | number | boolean;

/** What an Option registers from its `ngOnInit`; every signal reads its effective Options. */
export interface SelectOptionRegistration extends ɵOrigamiListboxOption {
  readonly value: Signal<SelectValue>;
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
  /** Its template's static `aria-label`, or null; a bound one isn't read. */
  readonly label: string | null;
}

/** Where opening puts the active option: the selected one (else the first enabled), or an end. */
export type SelectOpenTarget = "selected" | "first" | "last";

/**
 * Configuration of the Select Context, supplied by the root that provides it. The root's mode owns
 * what "selected" means and what choosing an option writes, so the single and multiple roots
 * share the Context and its parts.
 */
export abstract class SelectRootOptions {
  /** Whether the root selects several values: Content is `aria-multiselectable` and choosing keeps it open. */
  abstract readonly multiple: boolean;
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
 * @internal The Select's private owner: Select's policy over the shared listbox core
 * (`ɵOrigamiListbox` from /collection, which holds the option registrations, the active option
 * and the pending reveal), typeahead and the guarded choice. Focus stays on the Trigger; the
 * active option is only highlighted (`aria-activedescendant`). Only `choose` writes the value,
 * from a user's choice. It also owns the registered Trigger and the root's Signal Forms binding
 * (`FORM_FIELD` on the root's element).
 */
@Service({ autoProvided: false })
export class SelectContext {
  readonly #root = injectDeferred(SelectRootOptions);
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #touches = new Subject<void>();
  readonly #content = signal<SelectContentRegistration | null>(null);
  readonly #trigger = signal<SelectTriggerRegistration | null>(null);
  readonly #typeahead = new ɵTypeaheadBuffer();
  #destroyed = false;
  /** Whether the list participated since the last user open, so losing participation closes. */
  #participated = false;

  /** Requested open state. */
  readonly open = computed(() => this.#root().open());
  readonly disabled = computed(() => this.#root().disabled());
  readonly empty = computed(() => this.#root().empty());
  /** The registered Content's native participation; false without Content. */
  readonly participating = computed(() => this.#content()?.participating() ?? false);
  readonly #listbox = new ɵOrigamiListbox<SelectOptionRegistration>(this.participating);
  /** Registered options in registration order. */
  readonly options = this.#listbox.options;
  /** The highlighted option while it is registered; never the value. */
  readonly active = this.#listbox.active;
  /** The active option while the list participates: what the Trigger and the options expose. */
  readonly highlighted = this.#listbox.highlighted;
  /** The Trigger's `aria-activedescendant`: the highlighted option's ID. */
  readonly activeDescendant = this.#listbox.activeDescendant;
  /** The registered Trigger's `aria-labelledby`, null until it registers and while it has none. */
  readonly labelledBy = computed(() => this.#trigger()?.labelledBy() ?? null);
  /** The registered Trigger's static `aria-label`, null until it registers and while it has none. */
  readonly triggerLabel = computed(() => this.#trigger()?.label ?? null);
  /** Whether the root selects several values. */
  readonly multiple = computed(() => this.#root().multiple);
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
          this.#listbox.activate(null);
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
    this.#listbox.register(option, destroyRef);
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

    this.#listbox.activate(this.#target(target));
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
    const match = ɵmatchTypeahead(this.#candidates(), null, search, typeaheadText);

    if (match !== null) {
      this.#listbox.activate(match);

      return;
    }

    this.#listbox.activate(this.#target("selected"));
  }

  /**
   * The active option after a pointer opened the list: the selected one, else the first enabled
   * one. Called after the Trigger's click opened it.
   */
  opened(): void {
    if (!this.#destroyed && this.open()) {
      this.#typeahead.reset();
      this.#participated = false;
      this.#listbox.activate(this.#target("selected"));
    }
  }

  /** Moves the active option; without one, Arrow keys start from the selected option. */
  move(move: ɵActiveOptionMove): void {
    if (this.active() === null && (move === "next" || move === "previous")) {
      const selected = this.#selectedOption();

      if (selected !== null) {
        this.#listbox.activate(selected);

        return;
      }
    }

    this.#listbox.move(move);
  }

  /** Whether a typeahead buffer typed before `time` still runs, so a Space joins it. */
  typeaheadRunning(time: number): boolean {
    return this.#typeahead.running(time);
  }

  /** A printable key while open: moves the active option to the next match, if any. */
  typeahead(character: string, time: number): void {
    const search = this.#typeahead.add(character, time);
    const match = ɵmatchTypeahead(this.#candidates(), this.active(), search, typeaheadText);

    if (match !== null) {
      this.#listbox.activate(match);
    }
  }

  /** A pointer moved over an option: it becomes active, without scrolling. Disabled options don't. */
  point(option: SelectOptionRegistration): void {
    this.#listbox.point(option);
  }

  /**
   * Scrolls each keyboard or opening activation into view inside Content; Content calls it once,
   * from its constructor.
   * @param content - Content's element.
   * @param ready - Reads its floating presentation's readiness, reactively.
   */
  scrollReveals(content: HTMLElement, ready: () => boolean): void {
    this.#listbox.scrollReveals(content, ready);
  }

  /**
   * A user's choice of `option`, else of the active option: dropped while the Select is disabled,
   * the `[formField]` on the root's element is readonly or the option is disabled. Without an
   * option to choose, it closes without writing, under either root.
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

  #target(target: SelectOpenTarget): SelectOptionRegistration | null {
    if (target === "selected") {
      const selected = this.#selectedOption();

      if (selected !== null) {
        return selected;
      }

      return ɵmoveActiveOption(this.#listbox.ordered(), null, "first");
    }

    return ɵmoveActiveOption(this.#listbox.ordered(), null, target);
  }

  /** The first enabled selected option in DOM order. */
  #selectedOption(): SelectOptionRegistration | null {
    for (const option of this.#listbox.ordered()) {
      if (!option.disabled() && this.selected(option.value())) {
        return option;
      }
    }

    return null;
  }

  /** Enabled options in current DOM order. */
  #candidates(): SelectOptionRegistration[] {
    const candidates: SelectOptionRegistration[] = [];

    for (const option of this.#listbox.ordered()) {
      if (!option.disabled()) {
        candidates.push(option);
      }
    }

    return candidates;
  }
}

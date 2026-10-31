import {
  DestroyRef,
  ElementRef,
  Service,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { Provider, Signal, WritableSignal } from "@angular/core";
import { FORM_FIELD } from "@angular/forms/signals";
import type { FieldState } from "@angular/forms/signals";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { Subject } from "rxjs";

/** The Calendar modes a picker root binds. */
export type DatePickerMode = "date" | "dates" | "range" | "month";

/**
 * @internal Configuration of the picker Context, supplied by the root that provides it: what
 * every picker root has, whatever its value type.
 */
export abstract class DatePickerRootOptions {
  /** The Calendar root the picker binds inside its Content. */
  abstract readonly mode: DatePickerMode;
  /** The root's effective value; only the bound Calendar's choices write it. */
  abstract readonly value: WritableSignal<unknown>;
  abstract readonly open: WritableSignal<boolean>;
  abstract readonly disabled: Signal<boolean>;
  abstract readonly readonly: Signal<boolean>;

  /**
   * Provides the root Options beside the Context.
   * @param factory - Runs in the root's injection context the first time the Context reads it.
   * @returns A local provider.
   */
  static provideFactory(factory: () => DatePickerRootOptions): Provider {
    return { provide: DatePickerRootOptions, useFactory: factory };
  }
}

/** What the bound Calendar registers: the picker resets and focuses it on open. */
export interface DatePickerCalendar {
  reset(): void;
  focus(options?: FocusOptions): void;
  focusPending(): boolean;
}

/** What the Trigger registers from its `ngOnInit`. */
export interface DatePickerTriggerRegistration {
  readonly element: HTMLElement;
  /** The Trigger's effective ID. */
  readonly id: () => string;
  /** The Field's Labels inside a Field, otherwise the Trigger's static `aria-labelledby`. */
  readonly labelledBy: Signal<string | null>;
  /** The Trigger's template `aria-label`. */
  readonly label: string | null;
  /** The composed Popover Trigger's native participation of Content. */
  readonly participating: Signal<boolean>;
}

/**
 * @internal The picker's private owner: the registered Trigger and Calendar, the open session
 * (reset, then focus into the grid once Content is shown), completed choices, and leaving the
 * picker (touch and close). It reads the root's Signal Forms binding (`FORM_FIELD` on the root's
 * element).
 */
@Service({ autoProvided: false })
export class DatePickerContext {
  readonly #root = injectDeferred(DatePickerRootOptions);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #binding = inject(FORM_FIELD, { self: true, optional: true });
  readonly #touches = new Subject<void>();
  readonly #trigger = signal<DatePickerTriggerRegistration | null>(null);
  readonly #calendar = signal<DatePickerCalendar | null>(null);
  /** An open asked for the grid's focus, which waits for Content to be shown and a Calendar. */
  readonly #focusRequested = signal(false);
  /** An open's reset waits for a Calendar that registers after it, such as one gated by Content. */
  #resetPending = false;
  #destroyed = false;

  readonly mode = computed(() => this.#root().mode);
  readonly value = computed(() => this.#root().value);
  readonly disabled = computed(() => this.#root().disabled());
  readonly readonly = computed(() => this.#root().readonly());
  /** The registered Trigger's Field Labels, else its static `aria-labelledby`. */
  readonly labelledBy = computed(() => this.#trigger()?.labelledBy() ?? null);
  /** The registered Trigger's template `aria-label`. */
  readonly triggerLabel = computed(() => this.#trigger()?.label ?? null);
  /** The registered Trigger's ID. */
  readonly triggerId = computed(() => this.#trigger()?.id() ?? null);
  /** Content natively participates; false without a Trigger. */
  readonly participating = computed(() => this.#trigger()?.participating() ?? false);
  /** Emits synchronously when focus leaves the picker; the root reports it as `touch`. */
  readonly touches = this.#touches.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#touches.complete();
    });

    // Each open resets the Calendar, as a fresh mount would, and asks for the grid's focus. A
    // Calendar that isn't registered yet is reset when it registers, before it first renders.
    let wasOpen = false;

    effect(() => {
      const open = this.#root().open();

      if (open === wasOpen) {
        return;
      }

      wasOpen = open;

      untracked(() => {
        this.#focusRequested.set(open);
        this.#resetPending = open;

        if (open) {
          this.#resetCalendar();
        }
      });
    });

    // Disabling an open picker closes it; an open write while disabled stays authoritative.
    let wasDisabled: boolean | null = null;

    effect(() => {
      const disabled = this.disabled();

      if (wasDisabled === false && disabled) {
        untracked(() => this.#root().open.set(false));
      }

      wasDisabled = disabled;
    });

    // Browser-only: Content participates only after a native show.
    effect(() => {
      if (!this.#focusRequested() || !this.participating()) {
        return;
      }

      const calendar = this.#calendar();

      if (calendar === null) {
        return;
      }

      untracked(() => {
        this.#focusRequested.set(false);
        calendar.focus();
      });
    });
  }

  /** Registers the Trigger from its `ngOnInit`, unless its view is already destroyed. */
  registerTrigger(trigger: DatePickerTriggerRegistration, destroyRef: DestroyRef): void {
    this.#register(this.#trigger, trigger, "Trigger", destroyRef);
  }

  /** Registers the bound Calendar from its root's `ngOnInit`, unless its view is already destroyed. */
  registerCalendar(calendar: DatePickerCalendar, destroyRef: DestroyRef): void {
    this.#register(this.#calendar, calendar, "Calendar", destroyRef);
    this.#resetCalendar();
  }

  /** The Signal Forms state bound on the root's element, or null without `[formField]`. */
  formState(): FieldState<unknown> | null {
    return this.#binding?.state() ?? null;
  }

  /** Focuses the registered Trigger. */
  focus(options?: FocusOptions): void {
    this.#trigger()?.element.focus(options);
  }

  /** The bound Calendar completed a choice: the picker closes, and Popover returns focus. */
  chosen(): void {
    if (!this.#destroyed) {
      this.#root().open.set(false);
    }
  }

  /**
   * The root element's `focusout`: focus moving to an element outside the picker touches and
   * closes it without moving focus; focus falling to nothing (another window) only touches.
   * Content is authored inside the root, so its focus moves bubble there from the top layer.
   */
  focusOut(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (next instanceof Node && this.#element.contains(next)) {
      return;
    }

    // Focus falling to nothing isn't leaving the picker while the Calendar's focused cell leaves
    // with its month (Chromium drops focus as the cell is removed)…
    if (next === null && untracked(this.#calendar)?.focusPending() === true) {
      return;
    }

    // …or while the picker is disabled: the Calendar's cells stop being focusable, and an engine
    // may drop focus from one before the close turns Content inert…
    if (next === null && untracked(this.disabled)) {
      return;
    }

    // …or while closing Content turns inert before Popover returns focus to the Trigger, after
    // the render: an engine may drop focus to nothing in between.
    if (
      next === null &&
      event.target instanceof Element &&
      event.target.closest("[inert]") !== null
    ) {
      return;
    }

    this.#touches.next();

    if (next instanceof Element) {
      this.#root().open.set(false);
    }
  }

  /** Resets the registered Calendar once per open, if the open's reset is still pending. */
  #resetCalendar(): void {
    const calendar = untracked(this.#calendar);

    if (this.#resetPending && calendar !== null) {
      this.#resetPending = false;
      calendar.reset();
    }
  }

  #register<T>(
    slot: WritableSignal<T | null>,
    part: T,
    role: string,
    destroyRef: DestroyRef,
  ): void {
    if (destroyRef.destroyed) {
      return;
    }

    if (untracked(slot) !== null) {
      throw new Error(`Date picker supports only one mounted ${role}.`);
    }

    slot.set(part);
    destroyRef.onDestroy(() => {
      if (untracked(slot) === part) {
        slot.set(null);
      }
    });
  }
}

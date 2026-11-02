import {
  Directive,
  LOCALE_ID,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
  model,
  untracked,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl, ValidationError } from "@angular/forms/signals";
import {
  OrigamiDateFieldState,
  OrigamiDateTimeField,
  OrigamiDateTimeFieldOptions,
  ɵhourCycleAttribute,
} from "@loozo/origami-ui/date-field";
import type { OrigamiDateFieldPart } from "@loozo/origami-ui/date-field";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { DatePickerContext, DatePickerRootOptions } from "./date-picker-context";

/**
 * Effective `ogDateTimePicker` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiDateTimePickerOptions {
  /**
   * Writable local date-time, `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss` with no time zone, or
   * null; the direct directive model defaults to null. Only the composed date-time field's commit
   * writes it, from the segments or from a day chosen in the bound Calendar once the time is
   * complete, and `clear()`. External writes remain authoritative; a value that isn't canonical
   * shows empty segments, selects no day and is kept.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * Requested open state of Content, writable by behavior; direct model default false. The
   * Trigger, a choice, Escape, an outside press and focus leaving the picker write it.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Natively disables the Trigger, so the picker doesn't open, and disables the segments and the
   * bound Calendar; default false. Becoming true closes an open picker. External writes, `open`
   * included, remain authoritative.
   */
  abstract readonly disabled: Signal<boolean>;
  /** Opens and browses the bound Calendar without choosing, with readonly segments; default false. */
  abstract readonly readonly: Signal<boolean>;
  /**
   * BCP 47 locale of the composed date-time field's segments; default Angular's `LOCALE_ID`. The
   * Calendar inside Content has its own `locale`.
   */
  abstract readonly locale: Signal<string>;
  /**
   * The segments' precision: `"minute"` (the default) writes `YYYY-MM-DDTHH:mm`, `"second"` adds
   * the second segment and writes `YYYY-MM-DDTHH:mm:ss`.
   */
  abstract readonly precision: Signal<"minute" | "second">;
  /** The segments' hour cycle, 12 or 24; default null, the locale's. */
  abstract readonly hourCycle: Signal<12 | 24 | null>;

  /**
   * Replaces Date-time picker Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDateTimePickerOptions> | AbstractType<OrigamiDateTimePickerOptions>,
  ): Provider {
    return { provide: OrigamiDateTimePickerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Date-time picker Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiDateTimePickerOptions): Provider {
    return { provide: OrigamiDateTimePickerOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogDateTimePicker`. */
@Service({ autoProvided: false })
export class OrigamiDateTimePickerState {
  readonly #options = injectDeferred(OrigamiDateTimePickerOptions);
  readonly #dateTimeField = inject(OrigamiDateFieldState);

  /**
   * Effective value, the last committed one while the segments are incomplete, including null and
   * a value that isn't canonical. No writable alias is exposed.
   */
  readonly value: Signal<string | null> = computed(() => this.#options().value());
  /** Effective requested open state, not whether Content is shown yet. */
  readonly open: Signal<boolean> = computed(() => this.#options().open());
  /** Effective disabled policy. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /** Effective readonly policy. */
  readonly readonly: Signal<boolean> = computed(() => this.#options().readonly());
  /**
   * The composed date-time field's segments, in `locale`'s order: `OrigamiDateFieldState.segments`.
   */
  readonly segments: Signal<readonly OrigamiDateFieldPart[]> = this.#dateTimeField.segments;
  /**
   * The composed date-time field's parse errors, `dateTimeIncomplete` or `dateInvalid`:
   * `OrigamiDateFieldState.parseErrors`.
   */
  readonly parseErrors: Signal<readonly ValidationError.WithoutFieldTree[]> =
    this.#dateTimeField.parseErrors;
}

/**
 * Date-time picker root for one local date and time: the segments of a date-time field, typed as
 * on `ogDateTimeField`, with a Trigger button among them that opens Content, a non-modal popup in
 * which you author an `ogCalendar` with its own header, grid and configuration. Choosing a day
 * sets the date and keeps the time you typed. It composes `ogPopover` (native top layer, Escape
 * and outside dismissal, nesting in a Dialog or Popover) and `ogDateTimeField`, which supplies the
 * segments, their parse errors and `data-layout`. Only the field shape exists: the Trigger sits
 * inside the `ogDateFieldInput` with the segments of `state.segments()`; a Trigger outside it isn't
 * supported, since a day alone can't complete a date-time.
 *
 * Choosing a day writes its year, month and day into the segments and keeps the hour, minute,
 * second and day period as typed, empty ones included; it never fills in a time. With every
 * segment then filled, the value commits at the root's precision (`valueChange` only if it
 * changed) and focus returns to the Trigger. Otherwise the last value is kept, the date-time field
 * reports `dateTimeIncomplete`, and focus moves to the first empty segment, so the next keystroke
 * types the time. A choice of the day already shown is the same write, so it also replaces a
 * half-typed or impossible date. Every choice closes the picker; none touches.
 *
 * The bound Calendar selects the day the date segments show when they name a real day, else the
 * committed value's day, else none, and each open's reset follows it: its month, and the initial
 * focus. Each open resets the Calendar as a fresh mount would, then moves focus to the grid's tab
 * stop once Content is shown. Escape goes to the Calendar first (a coarser view back to the days),
 * then closes the picker with focus on the Trigger. Focus moving to an element outside the root
 * closes the picker without moving focus and emits `touch`; focus falling to nothing (another
 * window) only emits `touch`. Moving between the segments, the Trigger and Content doesn't; a
 * press on a segment while open closes it by the outside-press rule, with focus on the segment and
 * no touch. The composed date-time field's own `touch` isn't forwarded. Readonly opens and browses
 * but never chooses, with readonly segments; disabled natively disables the Trigger and the
 * segments and closes an open picker.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled` and `readonly` inputs, listens to `touch`, and receives the date-time field's parse
 * errors; `focusBoundControl()` calls `focus()`, which focuses the first segment. The Input group
 * is the control of its nearest `ogField`; the Trigger joins no Field, so name it with an
 * `aria-label`, which also names Content.
 *
 * Server rendering: the picker renders closed, with the segments and the date-time field's
 * `data-layout` seed on the root's host. Gate the Calendar on Content's retention, as under
 * `ogDatePicker`, to skip its work.
 *
 * @example
 * ```html
 * <div ogDateTimePicker [formField]="form.startsAt" #picker="ogDateTimePicker">
 *   <div ogDateFieldInput>
 *     @for (part of picker.state.segments(); track part.key) {
 *       @if (part.type === "literal") {
 *         <span aria-hidden="true">{{ part.text }}</span>
 *       } @else {
 *         <span [ogDateFieldSegment]="part.type"></span>
 *       }
 *     }
 *     <button ogDatePickerTrigger aria-label="Choose date">📅</button>
 *   </div>
 *   <div ogDatePickerContent align="end">
 *     <div ogCalendar>…</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogDateTimePicker]",
  exportAs: "ogDateTimePicker",
  hostDirectives: [OrigamiPopover, OrigamiDateTimeField],
  providers: [
    OrigamiDateTimePickerOptions.provideExisting(() => OrigamiDateTimePicker),
    DatePickerRootOptions.provideFactory(() => {
      const options = inject(OrigamiDateTimePickerOptions);
      const dateTimeField = inject(OrigamiDateTimeField, { self: true });
      // The bound Calendar's value: the day the segments show. A choice writes it, and `chosen()`
      // merges it into the segments; it never writes the root's value directly.
      const day = linkedSignal(() => dateTimeField.ɵshownDay());

      return {
        mode: "date",
        value: day as WritableSignal<unknown>,
        open: options.open,
        disabled: options.disabled,
        readonly: options.readonly,
        field: {
          focus: (focusOptions) => dateTimeField.focus(focusOptions),
          chosen: () => {
            const chosen = untracked(day);

            // A completed choice always leaves a day: the Calendar wrote it or it was selected.
            if (chosen === null || dateTimeField.ɵchooseDay(chosen)) {
              return null;
            }

            return () => dateTimeField.ɵfocusFirstEmpty();
          },
        },
      };
    }),
    DatePickerContext,
    OrigamiDateTimePickerState,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(DatePickerRootOptions);

      return { open: root.open, disabled: root.disabled, dismissible: computed(() => true) };
    }),
    OrigamiDateTimeFieldOptions.provideFactory(() => {
      const options = inject(OrigamiDateTimePickerOptions);

      return {
        value: options.value,
        locale: options.locale,
        precision: options.precision,
        hourCycle: options.hourCycle,
        disabled: options.disabled,
        readonly: options.readonly,
      };
    }),
  ],
  host: {
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiDateTimePicker
  implements OrigamiDateTimePickerOptions, FormValueControl<string | null>
{
  /**
   * Own date-time model, default null; `valueChange` emits the values the segments and choices
   * commit, and `[formField]` binds it. Replaced Options supply the effective value instead and
   * do not fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own requested open-state model, default false; `openChange` emits opening and closing. */
  readonly open = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own readonly input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** Own locale input of the composed date-time field's segments, default `LOCALE_ID`. */
  readonly locale = input(inject(LOCALE_ID));
  /** Own precision input, default `"minute"`; replaced Options supply the effective one instead. */
  readonly precision = input<"minute" | "second">("minute");
  /**
   * Own hour cycle input, default null (the locale's), also from a static `hourCycle="12"` or
   * `"24"` attribute; replaced Options supply the effective one instead.
   */
  readonly hourCycle = input(null, { transform: ɵhourCycleAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiDateTimePickerState);

  readonly #context = inject(DatePickerContext);
  readonly #dateTimeField = inject(OrigamiDateTimeField, { self: true });

  /**
   * Emits when focus leaves the picker, to an element outside the root or to nothing;
   * `[formField]` marks its field touched. Opening, choosing, Escape and moving between the
   * segments, the Trigger and Content don't emit.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the date-time field's first segment (nothing while disabled) once the Trigger has
   * registered, in its `ngOnInit`; does nothing before. Signal Forms' `focusBoundControl()` calls
   * it.
   * @param options - Passed to the native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }

  /**
   * Empties the picker: the composed date-time field's `clear()`, which discards its draft and
   * commits null. `valueChange` emits only if the value wasn't null. A programmatic write: it
   * applies whatever `disabled` and `readonly` say.
   */
  clear(): void {
    this.#dateTimeField.clear();
  }

  /** @internal Focus leaving the picker touches and closes it. */
  protected focusLeft(event: FocusEvent): void {
    this.#context.focusOut(event);
  }
}

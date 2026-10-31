import {
  Directive,
  Service,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { DatePickerContext, DatePickerRootOptions } from "./date-picker-context";

/**
 * Effective `ogMonthPicker` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiMonthPickerOptions {
  /**
   * Writable chosen month, `YYYY-MM`, or null; the direct directive model defaults to null. Only
   * a choice of a month in the bound `ogMonthCalendar` writes it, and not while readonly or
   * disabled. External writes remain authoritative; a value that isn't canonical selects no month
   * and is kept.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * Requested open state of Content, writable by behavior; direct model default false. The
   * Trigger, a month's choice, Escape, an outside press and focus leaving the picker write it;
   * choosing a year, which shows its months, doesn't.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Natively disables the Trigger, so the picker doesn't open, and disables the bound Calendar;
   * default false. Becoming true closes an open picker. External writes, `open` included, remain
   * authoritative.
   */
  abstract readonly disabled: Signal<boolean>;
  /** Opens and browses the bound Calendar without choosing; default false. */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces Month picker Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiMonthPickerOptions> | AbstractType<OrigamiMonthPickerOptions>,
  ): Provider {
    return { provide: OrigamiMonthPickerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Month picker Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiMonthPickerOptions): Provider {
    return { provide: OrigamiMonthPickerOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogMonthPicker`. */
@Service({ autoProvided: false })
export class OrigamiMonthPickerState {
  readonly #options = injectDeferred(OrigamiMonthPickerOptions);

  /** Effective month, including null and a value that isn't canonical. No writable alias is exposed. */
  readonly value: Signal<string | null> = computed(() => this.#options().value());
  /** Effective requested open state, not whether Content is shown yet. */
  readonly open: Signal<boolean> = computed(() => this.#options().open());
  /** Effective disabled policy. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /** Effective readonly policy. */
  readonly readonly: Signal<boolean> = computed(() => this.#options().readonly());
}

/**
 * Date picker root for one month: a Trigger button opens Content, a non-modal popup in which you
 * author an `ogMonthCalendar` with its own header, grid and configuration. The picker binds that
 * Calendar's value, disabled and readonly; the Calendar's own `value` binding is ignored inside
 * Content. It composes `ogPopover` (native top layer, Escape and outside dismissal, nesting in a
 * Dialog or Popover). The Trigger is the Field's control.
 *
 * Each open resets the Calendar as a fresh mount would (its displayed year follows the value,
 * its view is the months, no month remembered as focused), then moves focus to the grid's tab
 * stop once Content is shown. Choosing a month closes the picker, the month already selected
 * included, and focus returns to the Trigger; choosing a year in the years view shows its months
 * and keeps it open. Escape returns from the years view first, then closes the picker. Focus
 * leaving the root closes the picker without moving focus and emits `touch`; focus falling to
 * nothing (another window) only emits `touch`. Readonly opens and browses but never chooses;
 * disabled natively disables the Trigger and closes an open picker.
 *
 * It is an Angular Signal Forms value control for a `string | null` field: `[formField]` binds
 * its `value` model, writes its `disabled` and `readonly` inputs, listens to `touch`, and
 * `focusBoundControl()` calls `focus()`, which focuses the Trigger. Origami formats nothing:
 * render the Trigger's text from `state.value()`.
 *
 * Server rendering: the picker renders closed. Gate the Calendar on Content's retention, as
 * under `ogDatePicker`, to skip its work.
 *
 * @example
 * ```html
 * <div ogMonthPicker [formField]="form.expiry" #picker="ogMonthPicker">
 *   <button ogDatePickerTrigger>{{ picker.state.value() ?? "Choose a month" }}</button>
 *   <div ogDatePickerContent>
 *     <div ogMonthCalendar>…</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogMonthPicker]",
  exportAs: "ogMonthPicker",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiMonthPickerOptions.provideExisting(() => OrigamiMonthPicker),
    DatePickerRootOptions.provideFactory(() => {
      const options = inject(OrigamiMonthPickerOptions);

      return {
        mode: "month",
        value: options.value as WritableSignal<unknown>,
        open: options.open,
        disabled: options.disabled,
        readonly: options.readonly,
      };
    }),
    DatePickerContext,
    OrigamiMonthPickerState,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(DatePickerRootOptions);

      return { open: root.open, disabled: root.disabled, dismissible: computed(() => true) };
    }),
  ],
  host: {
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiMonthPicker
  implements OrigamiMonthPickerOptions, FormValueControl<string | null>
{
  /**
   * Own chosen-month model, default null; `valueChange` emits the months a user chooses, and
   * `[formField]` binds it. Replaced Options supply the effective value instead and do not
   * fabricate this output.
   */
  readonly value = model<string | null>(null);
  /** Own requested open-state model, default false; `openChange` emits opening and closing. */
  readonly open = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own readonly input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiMonthPickerState);

  readonly #context = inject(DatePickerContext);

  /**
   * Emits when focus leaves the picker, to an element outside the root or to nothing;
   * `[formField]` marks its field touched. Opening, choosing, Escape and moving between the
   * Trigger and Content don't emit.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the Trigger once it has registered, in its `ngOnInit`; does nothing before. Signal
   * Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }

  /** @internal Focus leaving the picker touches and closes it. */
  protected focusLeft(event: FocusEvent): void {
    this.#context.focusOut(event);
  }
}

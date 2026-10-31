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
import type { OrigamiDateRange } from "@loozo/origami-ui/calendar";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { DatePickerContext, DatePickerRootOptions } from "./date-picker-context";

/**
 * Effective `ogDatePickerRange` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiDatePickerRangeOptions {
  /**
   * Writable chosen range, `{ start, end }` of `YYYY-MM-DD` days in chronological order, or null;
   * the direct directive model defaults to null. Only the second choice in the bound
   * `ogCalendarRange` writes it, never a pending first day, and not while readonly or disabled.
   * External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<OrigamiDateRange | null>;
  /**
   * Requested open state of Content, writable by behavior; direct model default false. The
   * Trigger, a completed range, Escape, an outside press and focus leaving the picker write it.
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
   * Replaces Range date picker Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDatePickerRangeOptions> | AbstractType<OrigamiDatePickerRangeOptions>,
  ): Provider {
    return { provide: OrigamiDatePickerRangeOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Range date picker Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiDatePickerRangeOptions): Provider {
    return { provide: OrigamiDatePickerRangeOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogDatePickerRange`. */
@Service({ autoProvided: false })
export class OrigamiDatePickerRangeState {
  readonly #options = injectDeferred(OrigamiDatePickerRangeOptions);

  /**
   * Effective range, including null; never half a range. No writable alias is exposed. The
   * pending first day is the bound Calendar's `state.anchor()`.
   */
  readonly value: Signal<OrigamiDateRange | null> = computed(() => this.#options().value());
  /** Effective requested open state, not whether Content is shown yet. */
  readonly open: Signal<boolean> = computed(() => this.#options().open());
  /** Effective disabled policy. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /** Effective readonly policy. */
  readonly readonly: Signal<boolean> = computed(() => this.#options().readonly());
}

/**
 * Date picker root for one range of days: a Trigger button opens Content, a non-modal popup in
 * which you author an `ogCalendarRange` with its own header, grid and configuration. The picker
 * binds that Calendar's value, disabled and readonly; the Calendar's own `value` binding is
 * ignored inside Content. It composes `ogPopover` (native top layer, Escape and outside
 * dismissal, nesting in a Dialog or Popover). The Trigger is the Field's control.
 *
 * Each open resets the Calendar as a fresh mount would (its `month` follows the range's start,
 * its view is the days, no pending first day, no day remembered as focused), then moves focus to
 * the grid's tab stop once Content is shown. The first choice sets the Calendar's pending first
 * day and keeps the picker open; the second writes `{ start, end }` in chronological order,
 * closes the picker and returns focus to the Trigger. Escape drops a pending first day first, then
 * returns from a coarser view, then closes the picker. Closing with a pending first day, by Escape,
 * an outside press or leaving, keeps the committed range; the next open drops that day. Focus
 * leaving the root closes the picker without moving focus and emits `touch`; focus falling to
 * nothing (another window) only emits `touch`. Readonly opens and browses but never chooses;
 * disabled natively disables the Trigger and closes an open picker.
 *
 * It is an Angular Signal Forms value control for an `OrigamiDateRange | null` field:
 * `[formField]` binds its `value` model, writes its `disabled` and `readonly` inputs, listens to
 * `touch`, and `focusBoundControl()` calls `focus()`, which focuses the Trigger. Origami formats
 * nothing: render the Trigger's text from `state.value()`.
 *
 * Server rendering: the picker renders closed. Gate the Calendar on Content's retention, as
 * under `ogDatePicker`, to skip its work.
 *
 * @example
 * ```html
 * <div ogDatePickerRange [formField]="form.stay" #picker="ogDatePickerRange">
 *   <button ogDatePickerTrigger>
 *     {{ picker.state.value()?.start ?? "Arrival" }} – {{ picker.state.value()?.end ?? "…" }}
 *   </button>
 *   <div ogDatePickerContent>
 *     <div ogCalendarRange>…</div>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogDatePickerRange]",
  exportAs: "ogDatePickerRange",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiDatePickerRangeOptions.provideExisting(() => OrigamiDatePickerRange),
    DatePickerRootOptions.provideFactory(() => {
      const options = inject(OrigamiDatePickerRangeOptions);

      return {
        mode: "range",
        value: options.value as WritableSignal<unknown>,
        open: options.open,
        disabled: options.disabled,
        readonly: options.readonly,
      };
    }),
    DatePickerContext,
    OrigamiDatePickerRangeState,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(DatePickerRootOptions);

      return { open: root.open, disabled: root.disabled, dismissible: computed(() => true) };
    }),
  ],
  host: {
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiDatePickerRange
  implements OrigamiDatePickerRangeOptions, FormValueControl<OrigamiDateRange | null>
{
  /**
   * Own chosen-range model, default null; `valueChange` emits each range a user completes, never
   * a pending first day, and `[formField]` binds it. Replaced Options supply the effective value
   * instead and do not fabricate this output.
   */
  readonly value = model<OrigamiDateRange | null>(null);
  /** Own requested open-state model, default false; `openChange` emits opening and closing. */
  readonly open = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own readonly input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiDatePickerRangeState);

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

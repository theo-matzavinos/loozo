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
 * Effective `ogDatePickerMultiple` configuration, replaced as a whole rather than merged with
 * unused defaults.
 */
export abstract class OrigamiDatePickerMultipleOptions {
  /**
   * Writable chosen days, `YYYY-MM-DD` each; the direct directive model defaults to an empty
   * array. Only a toggle in the bound `ogCalendarMultiple` writes it, and not while readonly or
   * disabled; the Calendar's toggle rule applies. External writes remain authoritative.
   */
  abstract readonly value: WritableSignal<readonly string[]>;
  /**
   * Requested open state of Content, writable by behavior; direct model default false. The
   * Trigger, Escape, an outside press and focus leaving the picker write it; a choice never does,
   * so close it yourself, as from a Done button in Content.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * Natively disables the Trigger, so the picker doesn't open, and disables the bound Calendar;
   * default false. Becoming true closes an open picker. External writes, `open` included, remain
   * authoritative.
   */
  abstract readonly disabled: Signal<boolean>;
  /** Opens and browses the bound Calendar without toggling; default false. */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces Multiple date picker Options with an existing compatible concrete or abstract
   * provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiDatePickerMultipleOptions>
      | AbstractType<OrigamiDatePickerMultipleOptions>,
  ): Provider {
    return { provide: OrigamiDatePickerMultipleOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Multiple date picker Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiDatePickerMultipleOptions): Provider {
    return { provide: OrigamiDatePickerMultipleOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogDatePickerMultiple`. */
@Service({ autoProvided: false })
export class OrigamiDatePickerMultipleState {
  readonly #options = injectDeferred(OrigamiDatePickerMultipleOptions);

  /** Effective chosen days as written. No writable alias is exposed. */
  readonly value: Signal<readonly string[]> = computed(() => this.#options().value());
  /** Effective requested open state, not whether Content is shown yet. */
  readonly open: Signal<boolean> = computed(() => this.#options().open());
  /** Effective disabled policy. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /** Effective readonly policy. */
  readonly readonly: Signal<boolean> = computed(() => this.#options().readonly());
}

/**
 * Date picker root for several days: a Trigger button opens Content, a non-modal popup in which
 * you author an `ogCalendarMultiple` with its own header, grid and configuration. The picker
 * binds that Calendar's value, disabled and readonly; the Calendar's own `value` binding is
 * ignored inside Content. It composes `ogPopover` (native top layer, Escape and outside
 * dismissal, nesting in a Dialog or Popover). The Trigger is the Field's control.
 *
 * Each open resets the Calendar as a fresh mount would (its `month` follows the value's first
 * day, its view is the days, no day remembered as focused), then moves focus to the grid's tab
 * stop once Content is shown. Toggling a day keeps the picker open: close it with your own
 * button in Content writing `open`, or by Escape (after the Calendar's coarser view), an outside
 * press, the Trigger or focus leaving the picker. Focus leaving the root closes the picker
 * without moving focus and emits `touch`; focus falling to nothing (another window) only emits
 * `touch`. Readonly opens and browses but never toggles; disabled natively disables the Trigger
 * and closes an open picker.
 *
 * It is an Angular Signal Forms value control for a `readonly string[]` field: `[formField]`
 * binds its `value` model, writes its `disabled` and `readonly` inputs, listens to `touch`, and
 * `focusBoundControl()` calls `focus()`, which focuses the Trigger. Origami formats nothing:
 * render the Trigger's text from `state.value()`.
 *
 * Server rendering: the picker renders closed. Gate the Calendar on Content's retention, as
 * under `ogDatePicker`, to skip its work.
 *
 * @example
 * ```html
 * <div ogDatePickerMultiple #picker="ogDatePickerMultiple" [formField]="form.holidays" [(open)]="open">
 *   <button ogDatePickerTrigger>{{ picker.state.value().length }} days</button>
 *   <div ogDatePickerContent>
 *     <div ogCalendarMultiple>…</div>
 *     <button ogButton (click)="open.set(false)">Done</button>
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogDatePickerMultiple]",
  exportAs: "ogDatePickerMultiple",
  hostDirectives: [OrigamiPopover],
  providers: [
    OrigamiDatePickerMultipleOptions.provideExisting(() => OrigamiDatePickerMultiple),
    DatePickerRootOptions.provideFactory(() => {
      const options = inject(OrigamiDatePickerMultipleOptions);

      return {
        mode: "dates",
        value: options.value as WritableSignal<unknown>,
        open: options.open,
        disabled: options.disabled,
        readonly: options.readonly,
      };
    }),
    DatePickerContext,
    OrigamiDatePickerMultipleState,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(DatePickerRootOptions);

      return { open: root.open, disabled: root.disabled, dismissible: computed(() => true) };
    }),
  ],
  host: {
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiDatePickerMultiple
  implements OrigamiDatePickerMultipleOptions, FormValueControl<readonly string[]>
{
  /**
   * Own chosen-days model, default an empty array; `valueChange` emits the toggles a user makes,
   * and `[formField]` binds it. Replaced Options supply the effective value instead and do not
   * fabricate this output.
   */
  readonly value = model<readonly string[]>([]);
  /** Own requested open-state model, default false; `openChange` emits opening and closing. */
  readonly open = model(false);
  /** Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Own readonly input, default false with boolean-attribute coercion; `[formField]` writes it. */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiDatePickerMultipleState);

  readonly #context = inject(DatePickerContext);

  /**
   * Emits when focus leaves the picker, to an element outside the root or to nothing;
   * `[formField]` marks its field touched. Opening, toggling, Escape and moving between the
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

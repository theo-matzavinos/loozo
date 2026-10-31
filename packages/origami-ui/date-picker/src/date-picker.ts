import {
  Directive,
  LOCALE_ID,
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
import type { FormValueControl, ValidationError } from "@angular/forms/signals";
import {
  OrigamiDateField,
  OrigamiDateFieldOptions,
  OrigamiDateFieldState,
} from "@loozo/origami-ui/date-field";
import type { OrigamiDateFieldPart } from "@loozo/origami-ui/date-field";
import { OrigamiPopover, OrigamiPopoverOptions } from "@loozo/origami-ui/popover";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { DatePickerContext, DatePickerRootOptions } from "./date-picker-context";

/** Effective `ogDatePicker` configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiDatePickerOptions {
  /**
   * Writable chosen day, a civil date `YYYY-MM-DD`, or null; the direct directive model defaults
   * to null. Only a choice in the bound Calendar, the composed date field's commit (the segments,
   * in the field shape) and `clear()` write it, and a choice not while readonly or disabled.
   * External writes remain authoritative; a value that isn't canonical selects no day and is
   * kept.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * Requested open state of Content, writable by behavior; direct model default false. The
   * Trigger, a completed choice, Escape, an outside press and focus leaving the picker write it.
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
   * BCP 47 locale of the composed date field's segments; default Angular's `LOCALE_ID`. The
   * Calendar inside Content has its own `locale`.
   */
  abstract readonly locale: Signal<string>;

  /**
   * Replaces Date picker Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDatePickerOptions> | AbstractType<OrigamiDatePickerOptions>,
  ): Provider {
    return { provide: OrigamiDatePickerOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Date picker Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply every property.
   * @returns A local provider. Ordinary writable signals do not emit an unused directive model's output.
   */
  static provideFactory(factory: () => OrigamiDatePickerOptions): Provider {
    return { provide: OrigamiDatePickerOptions, useFactory: factory };
  }
}

/** Locally provided readonly facade for the nearest `ogDatePicker`. */
@Service({ autoProvided: false })
export class OrigamiDatePickerState {
  readonly #options = injectDeferred(OrigamiDatePickerOptions);
  readonly #dateField = inject(OrigamiDateFieldState);

  /** Effective value, including null and a value that isn't canonical. No writable alias is exposed. */
  readonly value: Signal<string | null> = computed(() => this.#options().value());
  /** Effective requested open state, not whether Content is shown yet. */
  readonly open: Signal<boolean> = computed(() => this.#options().open());
  /** Effective disabled policy. */
  readonly disabled: Signal<boolean> = computed(() => this.#options().disabled());
  /** Effective readonly policy. */
  readonly readonly: Signal<boolean> = computed(() => this.#options().readonly());
  /** The composed date field's segments, in `locale`'s order: `OrigamiDateFieldState.segments`. */
  readonly segments: Signal<readonly OrigamiDateFieldPart[]> = this.#dateField.segments;
  /** The composed date field's parse errors: `OrigamiDateFieldState.parseErrors`. */
  readonly parseErrors: Signal<readonly ValidationError.WithoutFieldTree[]> =
    this.#dateField.parseErrors;
}

/**
 * Date picker root for one day: a Trigger button opens Content, a non-modal popup in which you
 * author an `ogCalendar` with its own header, grid and configuration. The picker binds that
 * Calendar's value, disabled and readonly; the Calendar's own `value` binding is ignored inside
 * Content. It composes `ogPopover` (native top layer, Escape and outside dismissal, nesting in a
 * Dialog or Popover) and `ogDateField`, whose segments render inside an `ogDateFieldInput`.
 *
 * Two shapes, by where the Trigger sits. In the button shape the Trigger stands alone, shows the
 * date you render and is the Field's control. In the field shape the Trigger sits inside an
 * `ogDateFieldInput` with the segments of `state.segments()`: the Input group is the Field's
 * control with the date field's parse errors, the Trigger is an action button beside the
 * segments, and a choice also discards a half-typed draft, so the segments show the chosen day
 * with no parse error even when it is the value already committed. A value typed while the
 * picker is open shows in the Calendar, whose `month` follows the value after each open's reset.
 *
 * Each open resets the Calendar as a fresh mount would (its `month` follows the value, its view
 * is the days, no day remembered as focused), then moves focus to the grid's tab stop once Content is shown: the selected day,
 * else today, else the first enabled day. Choosing a day closes the picker, the day already
 * selected included, and focus returns to the Trigger. Escape goes to the Calendar first (a
 * coarser view back to the days), then closes the picker with focus back on the Trigger. Focus
 * moving to an element outside the root, by Tab past the last control or a click on another
 * field, closes the picker without moving focus and emits `touch`; focus falling to nothing
 * (another window) only emits `touch`. Opening and moving between the segments, the Trigger and
 * Content don't; a press on a segment while open closes it by the outside-press rule, with focus
 * on the segment and no touch. The composed date field's own `touch` isn't forwarded.
 * Readonly opens and browses but never chooses; disabled natively disables the Trigger and closes
 * an open picker.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled` and `readonly` inputs, listens to `touch`, and `focusBoundControl()` calls `focus()`,
 * which focuses the Trigger, or the first segment in the field shape. The Trigger, or in the field
 * shape the Input group, is the control of its nearest `ogField`. Origami formats nothing: render
 * the Trigger's text from `state.value()`, such as with `DatePipe`.
 *
 * Server rendering: the picker renders closed; the composed date field writes its `data-layout`
 * seed to the root's host. A Calendar authored without `@if` renders hidden with its own seed;
 * gate it on Content's retention, `@if (content.state.open())` with
 * `#content="ogDatePickerContent"`, to skip that work. Gate on Content's, not the root's
 * `state.open()`: Content keeps the Calendar until focus has returned to the Trigger after a
 * choice, while the root's removes the focused cell first, so focus stays on the page.
 *
 * @example
 * ```html
 * <div ogDatePicker [formField]="form.validFrom" #picker="ogDatePicker">
 *   <button ogDatePickerTrigger>{{ picker.state.value() ?? "Choose a date" }}</button>
 *   <div ogDatePickerContent>
 *     <div ogCalendar #cal="ogCalendar">…</div>
 *   </div>
 * </div>
 *
 * <div ogDatePicker [formField]="form.dateOfBirth" #birth="ogDatePicker">
 *   <div ogDateFieldInput>
 *     @for (part of birth.state.segments(); track part.key) {
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
  selector: "[ogDatePicker]",
  exportAs: "ogDatePicker",
  hostDirectives: [OrigamiPopover, OrigamiDateField],
  providers: [
    OrigamiDatePickerOptions.provideExisting(() => OrigamiDatePicker),
    DatePickerRootOptions.provideFactory(() => {
      const options = inject(OrigamiDatePickerOptions);

      return {
        mode: "date",
        value: options.value as WritableSignal<unknown>,
        open: options.open,
        disabled: options.disabled,
        readonly: options.readonly,
      };
    }),
    DatePickerContext,
    OrigamiDatePickerState,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(DatePickerRootOptions);

      return { open: root.open, disabled: root.disabled, dismissible: computed(() => true) };
    }),
    OrigamiDateFieldOptions.provideFactory(() => {
      const options = inject(OrigamiDatePickerOptions);

      return {
        value: options.value,
        locale: options.locale,
        disabled: options.disabled,
        readonly: options.readonly,
      };
    }),
  ],
  host: {
    "(focusout)": "focusLeft($event)",
  },
})
export class OrigamiDatePicker
  implements OrigamiDatePickerOptions, FormValueControl<string | null>
{
  /**
   * Own chosen-day model, default null; `valueChange` emits the days a user chooses, and
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
  /** Own locale input of the composed date field's segments, default `LOCALE_ID`. */
  readonly locale = input(inject(LOCALE_ID));
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiDatePickerState);

  readonly #context = inject(DatePickerContext);
  readonly #dateField = inject(OrigamiDateField, { self: true });

  /**
   * Emits when focus leaves the picker, to an element outside the root or to nothing;
   * `[formField]` marks its field touched. Opening, choosing, Escape and moving between the
   * segments, the Trigger and Content don't emit.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the Trigger in the button shape, and in the field shape the date field's first
   * segment (nothing while disabled), once the Trigger has registered, in its `ngOnInit`; does
   * nothing before. Signal Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }

  /**
   * Empties the picker: the composed date field's `clear()`, which discards its draft and commits
   * null. `valueChange` emits only if the value wasn't null. A programmatic write: it applies
   * whatever `disabled` and `readonly` say.
   */
  clear(): void {
    this.#dateField.clear();
  }

  /** @internal Focus leaving the picker touches and closes it. */
  protected focusLeft(event: FocusEvent): void {
    this.#context.focusOut(event);
  }
}

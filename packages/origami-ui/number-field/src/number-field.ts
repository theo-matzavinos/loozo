import {
  Directive,
  LOCALE_ID,
  booleanAttribute,
  inject,
  input,
  model,
  numberAttribute,
} from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { NumberFieldContext } from "./number-field-context";
import { NumberFieldDraft } from "./number-field-draft";
import { OrigamiNumberFieldOptions } from "./number-field-options";
import { OrigamiNumberFieldState } from "./number-field-state";

/** A bound from a template: absent (undefined or null) is none, anything else a number. */
function boundAttribute(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return numberAttribute(value);
}

/** Fraction digits from a template: absent (undefined or null) is `Intl`'s default, null. */
function digitsAttribute(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return numberAttribute(value);
}

/**
 * Number field root: a finite number or null, typed as text in its locale's format into an
 * `ogNumberFieldInput`, `1.234,50` in `el`, and stepped by ArrowUp, ArrowDown and optional
 * `ogNumberFieldIncrement` and `ogNumberFieldDecrement` buttons. It is usually the wrapper element
 * around those parts and any decoration, such as a currency sign, which stays outside the text.
 *
 * Text: decimal only (`Intl.NumberFormat` with `minimumFractionDigits`, `maximumFractionDigits`
 * and `useGrouping`), in the locale's digits, decimal and group separators and minus sign; ASCII
 * digits and `-` also type. Text that is a whole number commits at once, so typing `1.5` in `el`
 * commits 1, then reports `numberInvalid` while the groups are incomplete: the value is the last
 * whole number typed. Empty text commits null; a lone minus or decimal separator reports
 * `numberIncomplete`. Typed values are never clamped or snapped: `min` and `max` bound stepping,
 * and the form schema reports a typed value out of range. Leaving the Input shows a whole number
 * in the format without a write. A change of `locale` or a format Option shows the value again,
 * discarding a half-typed text. Precision is `Number`'s: digits past about 15 significant ones
 * aren't kept exactly.
 *
 * Stepping moves to the next value aligned to `min ?? 0` plus a multiple of `step`, in its
 * direction, then clamps to the bounds; up does nothing at or above `max`, down at or below `min`.
 * From null, up writes `min ?? 0` and down `max ?? 0`, then clamped to the bounds: with `min` 5
 * and no `max`, down from null writes 5. An integer steps exactly (1 up from 10^15 + 1 is
 * 10^15 + 2); any other value steps as its 15-significant-digit form, so float noise doesn't
 * count: 0.7 + 0.1 (0.7999999999999999) steps by 0.1 up to 0.9. A step
 * whose result isn't a finite number, or doesn't move past the value (1 on 1e20), does nothing.
 * `min` greater than `max` is unsupported.
 *
 * Server rendering and hydration: the Input's `value` attribute carries the text, so the server
 * renders it; a hydrating Input keeps it, and text typed before its block hydrates commits once
 * it has rendered, not again when Angular replays the typing; a composition open across
 * hydration is checked when it ends; steps and leaving the Input before then apply after it, in the order they
 * happened. A browser whose `Intl` formats differently shows the server's text until the
 * value changes.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled`, `readonly`, `min` and `max` inputs from the schema (`min()` and `max()` rules), so a
 * static `min` beside `[formField]` doesn't compile; it listens to `touch`, which the root emits
 * when focus leaves the Input, and receives the text's parse errors. `focusBoundControl()` calls
 * `focus()`. A consumer directive that composes it through `hostDirectives` and is itself the
 * `FormValueControl`, with its own `value` model supplying these Options, is the control
 * `[formField]` binds; `[formField]` on a root with replacement Options and no such model is
 * unsupported. Its Input is the control of its nearest `ogField`.
 *
 * @example
 * ```html
 * <div ogNumberField [formField]="deposit.amount" minimumFractionDigits="2" maximumFractionDigits="2">
 *   <button ogNumberFieldDecrement aria-label="Decrease">−</button>
 *   <input ogNumberFieldInput placeholder="0,00" />
 *   <button ogNumberFieldIncrement aria-label="Increase">+</button>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogNumberField]",
  exportAs: "ogNumberField",
  providers: [
    OrigamiNumberFieldOptions.provideExisting(() => OrigamiNumberField),
    NumberFieldDraft,
    NumberFieldContext,
    OrigamiNumberFieldState,
  ],
})
export class OrigamiNumberField
  implements OrigamiNumberFieldOptions, FormValueControl<number | null>
{
  /**
   * Own value model, default null; `valueChange` emits values the user commits to this model by
   * typing or stepping, and `[formField]` binds it. Replaced Options supply the effective value
   * instead and do not fabricate this output.
   */
  readonly value = model<number | null>(null);
  /**
   * Own locale input, default `LOCALE_ID`; replaced Options supply the effective locale instead. A
   * locale `Intl` refuses throws `Intl`'s `RangeError` when the field formats, at render, on the
   * server too.
   */
  readonly locale = input(inject(LOCALE_ID));
  /**
   * Own lower stepping bound, default undefined (none), coercing a static attribute to a number;
   * `[formField]` writes it from the schema's `min()`. Replaced Options supply it instead.
   */
  readonly min = input<number | undefined, unknown>(undefined, { transform: boundAttribute });
  /**
   * Own upper stepping bound, default undefined (none), coercing a static attribute to a number;
   * `[formField]` writes it from the schema's `max()`. Replaced Options supply it instead.
   */
  readonly max = input<number | undefined, unknown>(undefined, { transform: boundAttribute });
  /** Own step input, default 1, coercing a static attribute to a number. */
  readonly step = input(1, { transform: numberAttribute });
  /**
   * Own minimum fraction digits input, default null (`Intl.NumberFormat`'s, 0), coercing a static
   * attribute to a number. A count outside `Intl`'s range (0 to 100), or above
   * `maximumFractionDigits`, throws `Intl`'s `RangeError` when the field formats, at render, on the
   * server too.
   */
  readonly minimumFractionDigits = input<number | null, unknown>(null, {
    transform: digitsAttribute,
  });
  /**
   * Own maximum fraction digits input, default null (`Intl.NumberFormat`'s: the larger of the
   * minimum and 3), coercing a static attribute to a number. A count outside `Intl`'s range (0 to
   * 100), or below `minimumFractionDigits`, throws `Intl`'s `RangeError` when the field formats, at
   * render, on the server too.
   */
  readonly maximumFractionDigits = input<number | null, unknown>(null, {
    transform: digitsAttribute,
  });
  /** Own grouping input, default true (the locale's), with boolean-attribute coercion. */
  readonly useGrouping = input(true, { transform: booleanAttribute });
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /**
   * Own readonly input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `readonly()` rules. Replaced Options supply effective policy instead.
   */
  readonly readonly = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiNumberFieldState);

  readonly #context = inject(NumberFieldContext);

  /** Emits when focus leaves the root's `ogNumberFieldInput`; `[formField]` marks its field touched. */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the Input, or, before it is mounted, the Input once it renders; nothing while
   * disabled. Signal Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the Input's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }
}

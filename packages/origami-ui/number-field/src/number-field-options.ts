import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/**
 * Effective `ogNumberField` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiNumberFieldOptions {
  /**
   * Writable committed value: a finite number or null; the direct directive model defaults to
   * null. Editing writes it whenever the Input's text is a whole number, and null when the text is
   * emptied; a half-typed or misgrouped text keeps it and reports a parse error. Stepping writes
   * it. Never written as NaN, ±Infinity or -0. A value that isn't finite shows empty text and is
   * kept until the user edits. Writing it replaces the text. Replacement Options may supply an
   * ordinary `signal()`, `linkedSignal()` or a composer's `model()`.
   */
  abstract readonly value: WritableSignal<number | null>;
  /**
   * BCP 47 locale of the text: its decimal and group separators, minus sign, digits and group
   * sizes (`Intl.NumberFormat`, decimal style); the direct directive defaults to `LOCALE_ID`. A
   * locale `Intl` refuses throws `Intl`'s `RangeError` when the field formats, at render, on the
   * server too.
   */
  abstract readonly locale: Signal<string>;
  /**
   * Lower bound of stepping: ArrowDown and Decrement never go below it, and the steps align to it.
   * Typed values below it are kept: validate them in the form schema. Undefined (the direct
   * default) is none; Signal Forms writes it from the schema's `min()`.
   */
  abstract readonly min: Signal<number | undefined>;
  /**
   * Upper bound of stepping: ArrowUp and Increment never go above it. Typed values above it are
   * kept. Undefined (the direct default) is none; Signal Forms writes it from the schema's `max()`.
   */
  abstract readonly max: Signal<number | undefined>;
  /**
   * The step of ArrowUp, ArrowDown, Increment and Decrement; direct default 1. Stepping does
   * nothing unless it is a positive finite number.
   */
  abstract readonly step: Signal<number>;
  /**
   * The fraction digits a value always shows (`2`: `1.234,50`); null, the direct default, is
   * `Intl.NumberFormat`'s, 0. A count outside `Intl`'s range (0 to 100), or above
   * `maximumFractionDigits`, throws `Intl`'s `RangeError` when the field formats, at render, on the
   * server too.
   */
  abstract readonly minimumFractionDigits: Signal<number | null>;
  /**
   * The most fraction digits a value shows and the text accepts; 0 accepts no decimal separator.
   * Null, the direct default, is `Intl.NumberFormat`'s: the larger of the minimum and 3. A count
   * outside `Intl`'s range (0 to 100), or below `minimumFractionDigits`, throws `Intl`'s
   * `RangeError` when the field formats, at render, on the server too.
   */
  abstract readonly maximumFractionDigits: Signal<number | null>;
  /**
   * True, the direct default, shows and accepts the locale's group separators (`1.234.567`);
   * false shows and accepts none.
   */
  abstract readonly useGrouping: Signal<boolean>;
  /** Disables the Input and the step buttons natively; direct default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Makes the Input natively readonly, still focusable, and blocks stepping; direct default false. */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces number field Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiNumberFieldOptions> | AbstractType<OrigamiNumberFieldOptions>,
  ): Provider {
    return { provide: OrigamiNumberFieldOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire number field Options configuration without merging unused directive
   * defaults.
   * @param factory - Injection-context factory supplying `value`, `locale`, `min`, `max`, `step`,
   *   `minimumFractionDigits`, `maximumFractionDigits`, `useGrouping`, `disabled` and `readonly`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiNumberFieldOptions): Provider {
    return { provide: OrigamiNumberFieldOptions, useFactory: factory };
  }
}

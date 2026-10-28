import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/**
 * Effective `ogTimeField` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiTimeFieldOptions {
  /**
   * Writable committed value: a wall-clock time, `HH:mm` at minute precision or `HH:mm:ss` at
   * second precision, 00:00 to 23:59:59, or null; the direct directive model defaults to null. It
   * carries no date and no time zone. Editing writes it, at the root's precision, only when every
   * segment holds a value, and null when every segment is emptied; an incomplete draft keeps it
   * and reports a parse error. A value of the other precision shows (`"09:30:15"` at minute
   * precision shows 09:30, `"09:30"` at second precision 09:30:00) and the next edit writes the
   * root's precision. A value that isn't canonical (`"9:30"`, `"24:00"`) shows empty segments and
   * is kept until the user edits. Writing it replaces the draft. Replacement Options may supply
   * an ordinary `signal()`, `linkedSignal()` or a composer's `model()`.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * BCP 47 locale of the segment order, the literals between them, the unit and day period names,
   * the digits and, while `hourCycle` is null, the hour cycle; the direct directive defaults to
   * `LOCALE_ID`. A root that hydrates keeps the server's layout until this changes.
   */
  abstract readonly locale: Signal<string>;
  /**
   * `"minute"` lays out hour and minute and writes `HH:mm`; `"second"` adds the second and writes
   * `HH:mm:ss`. The direct directive defaults to `"minute"`. A change shows the value again at
   * the new precision: a half-typed draft and its parse error go, and the value isn't written.
   */
  abstract readonly precision: Signal<"minute" | "second">;
  /**
   * 12 shows the hour 1 to 12 with a day period segment (midnight is 12 AM, noon 12 PM), 24 shows
   * it 0 to 23 without one, and null follows the locale (`en-US` 12, `en-GB` 24). The direct
   * directive defaults to null. A change of the resolved cycle shows the value again in the new
   * one: a half-typed draft and its parse error go, and the value isn't written.
   */
  abstract readonly hourCycle: Signal<12 | 24 | null>;
  /** Takes the segments out of the tab order and blocks editing; direct default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Blocks editing while the segments still focus and move; direct default false. */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces time field Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiTimeFieldOptions> | AbstractType<OrigamiTimeFieldOptions>,
  ): Provider {
    return { provide: OrigamiTimeFieldOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire time field Options configuration without merging unused directive
   * defaults.
   * @param factory - Injection-context factory supplying `value`, `locale`, `precision`,
   *   `hourCycle`, `disabled` and `readonly`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiTimeFieldOptions): Provider {
    return { provide: OrigamiTimeFieldOptions, useFactory: factory };
  }
}

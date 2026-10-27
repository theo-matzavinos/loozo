import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/**
 * Effective `ogDateField` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiDateFieldOptions {
  /**
   * Writable committed value: a civil date `YYYY-MM-DD` in the proleptic Gregorian calendar,
   * years 0001–9999, or null; the direct directive model defaults to null. It carries no time zone.
   * Editing writes it only when the segments hold a complete, real date, and null when every
   * segment is emptied; an incomplete or impossible draft keeps it and reports a parse error. A
   * value that isn't canonical (`"27/10/2026"`, `"2026-02-31"`) shows empty segments and is kept
   * until the user edits. Writing it replaces the draft. Replacement Options may supply an
   * ordinary `signal()`, `linkedSignal()` or a composer's `model()`.
   */
  abstract readonly value: WritableSignal<string | null>;
  /**
   * BCP 47 locale of the segment order, the literals between them, the unit names and the digits;
   * the direct directive defaults to `LOCALE_ID`. A root that hydrates keeps the server's layout
   * until this changes.
   */
  abstract readonly locale: Signal<string>;
  /** Takes the segments out of the tab order and blocks editing; direct default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Blocks editing while the segments still focus and move; direct default false. */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces date field Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDateFieldOptions> | AbstractType<OrigamiDateFieldOptions>,
  ): Provider {
    return { provide: OrigamiDateFieldOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire date field Options configuration without merging unused directive
   * defaults.
   * @param factory - Injection-context factory supplying `value`, `locale`, `disabled` and
   *   `readonly`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiDateFieldOptions): Provider {
    return { provide: OrigamiDateFieldOptions, useFactory: factory };
  }
}

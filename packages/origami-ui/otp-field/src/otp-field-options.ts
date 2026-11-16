import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/**
 * Effective `ogOtpField` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiOtpFieldOptions {
  /**
   * Writable code: a string of ASCII digits, empty `""` when nothing is typed, the direct
   * directive model's default. Every edit writes a code: digits only, at most `length` of them,
   * with no gaps, and only when it differs. A value written by the application is kept as
   * written, also one that isn't a code (`12ab`, `1234567`), until the next edit. Replacement
   * Options may supply an ordinary `signal()`, `linkedSignal()` or a composer's `model()`.
   */
  abstract readonly value: WritableSignal<string>;
  /**
   * The number of digits, and of cells; the direct directive defaults to 6. A value that isn't a
   * whole number of at least 1 is unsupported.
   */
  abstract readonly length: Signal<number>;
  /**
   * Masks the code as a PIN: the Input is `type="password"` and no cell record carries its digit;
   * direct default false.
   */
  abstract readonly mask: Signal<boolean>;
  /** Disables the Input natively; direct default false. */
  abstract readonly disabled: Signal<boolean>;
  /** Makes the Input natively readonly, still focusable and selectable; direct default false. */
  abstract readonly readonly: Signal<boolean>;

  /**
   * Replaces OTP field Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiOtpFieldOptions> | AbstractType<OrigamiOtpFieldOptions>,
  ): Provider {
    return { provide: OrigamiOtpFieldOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire OTP field Options configuration without merging unused directive
   * defaults.
   * @param factory - Injection-context factory supplying `value`, `length`, `mask`, `disabled` and
   *   `readonly`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiOtpFieldOptions): Provider {
    return { provide: OrigamiOtpFieldOptions, useFactory: factory };
  }
}

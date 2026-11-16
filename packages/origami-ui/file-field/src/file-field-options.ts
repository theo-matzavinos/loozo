import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/**
 * Effective `ogFileField` configuration, replaced as a whole rather than merged with unused
 * defaults.
 */
export abstract class OrigamiFileFieldOptions {
  /**
   * Writable chosen file, or null for none; the direct directive model defaults to null. A
   * genuine pick in the Input's native picker, a drop on an `ogFileFieldDropZone` and a pick made
   * before hydration write it, unless the field is disabled; a selection whose `File` is the same
   * object as the value writes nothing (`Object.is`). Writing it from the application or a form
   * is mirrored into the Input's native `files` after the next render, in the browser: a `File`
   * becomes the Input's one file, null empties it, which lets the user choose the same file
   * again. Replacement Options may supply an ordinary `signal()`, `linkedSignal()` or a
   * composer's `model()`; the Input mirrors writes to any of them without a consumer binding.
   */
  abstract readonly value: WritableSignal<File | null>;
  /**
   * Blocks the user's writes: the Input is natively disabled, so its picker doesn't open, and a
   * drop zone shows no `data-drag-over` and refuses file drops (`dropEffect` `"none"`, so no
   * `drop` is delivered). Writes to `value` from the application or a form still apply and are
   * mirrored. Direct default false.
   */
  abstract readonly disabled: Signal<boolean>;

  /**
   * Replaces file field Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiFileFieldOptions> | AbstractType<OrigamiFileFieldOptions>,
  ): Provider {
    return { provide: OrigamiFileFieldOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces the entire file field Options configuration without merging unused directive
   * defaults.
   * @param factory - Injection-context factory supplying `value` and `disabled`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiFileFieldOptions): Provider {
    return { provide: OrigamiFileFieldOptions, useFactory: factory };
  }
}

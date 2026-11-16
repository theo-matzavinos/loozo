import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { FileFieldContext } from "./file-field-context";

/**
 * Locally provided readonly facade for the nearest file field root; nested roots have independent
 * owners. It carries no form state and no `touch`: read those from Signal Forms or a Field.
 */
@Service({ autoProvided: false })
export class OrigamiFileFieldState {
  readonly #context = inject(FileFieldContext);

  /**
   * The effective chosen file, or null. Render its `name` as text: the Input's own status text
   * differs by engine and locale, and it is visually hidden.
   */
  readonly value: Signal<File | null> = this.#context.value;
  /** The root's effective disabled policy. */
  readonly disabled: Signal<boolean> = this.#context.disabled;
}

import { Directive, booleanAttribute, inject, input, model } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { FileFieldContext } from "./file-field-context";
import { OrigamiFileFieldOptions } from "./file-field-options";
import { OrigamiFileFieldState } from "./file-field-state";

/**
 * File field root: one `File` or null, chosen in the native picker of its `ogFileFieldInput`, a
 * native `<input type="file">` the consumer hides visually and names with a `<label>`, or dropped
 * on an optional `ogFileFieldDropZone`. It is usually a wrapper element around those parts; the
 * zone may be the root's own element or the `<label>` around the Input, so a click anywhere on it
 * opens the picker. An optional `ogFileFieldClear` button inside the root, outside the label,
 * empties it and moves focus to the Input. Origami owns the selection, the drag-over state and the
 * ARIA; the consumer owns the markup, the visible file name, previews, uploading and error text.
 *
 * Selection: a pick and a drop write the first file, a multi-file drop included; a selection whose
 * `File` is the value already writes nothing. Re-picking the same file without clearing writes
 * nothing in Chromium and WebKit and a new `File` in Firefox. Writing `value` (null included) is
 * mirrored into the Input's native `files` after the next render, so writing null lets the user
 * choose the same file again; a cancelled picker keeps the previous choice. `accept` is the
 * consumer's native picker hint, never enforced on drops or picks: validate size, type and name
 * with Signal Forms rules. One file only: don't add `multiple`.
 *
 * Drops outside every zone, and drops before the zone hydrates, get the browser's default, which
 * may open the file in a new tab or replace the page; install a page-wide guard in the app shell
 * if that matters (see the README).
 *
 * Server rendering and hydration: the server renders the Input and its ARIA, never a file. A pick
 * made in the server-rendered Input before its block hydrates is adopted once at the Input's first
 * render, as a completed choice that touches; Angular's replayed `change` doesn't write it again.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model on a
 * `File | null` field, writes its `disabled` input from the field's `disabled()` rules and listens
 * to `touch`, which the root emits when focus leaves the Input and after each pick, drop and
 * adopted pre-hydration pick, never before its first browser render. `focusBoundControl()` calls
 * `focus()`. A bare `reset()` resets touched and dirty only and keeps the file: pass the value,
 * `reset({ file: null })`. A consumer directive that composes it through `hostDirectives` and is
 * itself the `FormValueControl`, with its own `value` model supplying these Options, is the
 * control `[formField]` binds; `[formField]` on a root with replacement Options and no such model
 * is unsupported. Its Input is the control of its nearest `ogField`. There is no `readonly`, `name`
 * or native form submission.
 *
 * @example
 * ```html
 * <div ogFileField [formField]="billing.invoice" #picker="ogFileField">
 *   <label ogFieldLabel ogFileFieldDropZone class="drop-zone">
 *     <span class="button-look">Choose a file</span> or drag it here
 *     <input ogFileFieldInput class="sr-only" accept=".pdf,.jpg,.jpeg,.png" />
 *   </label>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogFileField]",
  exportAs: "ogFileField",
  providers: [
    OrigamiFileFieldOptions.provideExisting(() => OrigamiFileField),
    FileFieldContext,
    OrigamiFileFieldState,
  ],
})
export class OrigamiFileField implements OrigamiFileFieldOptions, FormValueControl<File | null> {
  /**
   * Own value model, default null; `valueChange` emits the files the user chooses into this model
   * by picking, dropping or picking before hydration, and `[formField]` binds it. Replaced Options
   * supply the effective value instead and do not fabricate this output.
   */
  readonly value = model<File | null>(null);
  /**
   * Own disabled input, default false with boolean-attribute coercion; `[formField]` writes it
   * from the field's `disabled()` rules. Replaced Options supply effective policy instead.
   */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** This root's readonly effective observation, shared with its descendants. */
  readonly state = inject(OrigamiFileFieldState);

  readonly #context = inject(FileFieldContext);

  /**
   * Emits when the field is touched: focus left the root's `ogFileFieldInput`, or the user picked,
   * dropped or, before hydration, picked a file; never before the root's first browser render,
   * when requests made earlier are delivered once. `[formField]` marks its field touched.
   */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the mounted Input; nothing without one, before it mounts or while disabled. Signal
   * Forms' `focusBoundControl()` calls it.
   * @param options - Passed to the Input's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }
}

import { Directive, booleanAttribute, inject, input, model, numberAttribute } from "@angular/core";
import { outputFromObservable } from "@angular/core/rxjs-interop";
import type { FormValueControl } from "@angular/forms/signals";
import { OtpFieldContext } from "./otp-field-context";
import { OrigamiOtpFieldOptions } from "./otp-field-options";
import { OrigamiOtpFieldState } from "./otp-field-state";

/**
 * OTP field root: a one-time code or PIN of `length` ASCII digits, typed into one native
 * `ogOtpFieldInput` that the consumer lays transparently over cells it draws from
 * `state.cells()`. It is usually the wrapper element around the Input and the cells, which are
 * `aria-hidden`: the Input is the one named, focusable control, and its caret, selection and
 * undo are the browser's.
 *
 * Code: every edit (typing, deletion, paste, drop, autofill and an input method's composition,
 * checked once when it ends) is read with NFKC and without whitespace and dash-like separators,
 * so full-width digits and `123 456` or `12-34-56` type their digits, and is undone unless what
 * is left is ASCII digits only, at most `length` of them. An accepted edit writes the code when it
 * differs: the value is always a compact digit string with no gaps, `""` when empty. A value the
 * application writes is kept as written, also one that isn't a code, until the next edit; the
 * cells show its first `length` characters. Whether the code is whole is `state.complete()`;
 * exact validation is the form's: `required` plus `pattern(/^[0-9]{6}$/)`.
 *
 * Completion: there is no completion event. `valueChange` fires synchronously inside the edit,
 * after the model holds the code, so a handler that reads `state.complete()` there reacts to every
 * completed edit; a value the application writes never emits, so a writer of yours that should
 * complete the code checks it itself.
 *
 * Server rendering and hydration: the Input's `value` attribute carries the value, so the server
 * renders it; a hydrating Input keeps it, and digits typed before its block hydrates are taken as
 * one edit once it has rendered, not again when Angular replays the typing; a composition open
 * across hydration is checked when it ends; leaving the Input before then touches after it.
 *
 * It is an Angular Signal Forms value control: `[formField]` binds its `value` model, writes its
 * `disabled` and `readonly` inputs from the schema and listens to `touch`, which the root emits
 * when focus leaves the Input. `focusBoundControl()` calls `focus()`. A consumer directive that
 * composes it through `hostDirectives` and is itself the `FormValueControl`, with its own `value`
 * model supplying these Options, is the control `[formField]` binds; `[formField]` on a root with
 * replacement Options and no such model is unsupported. Its Input is the control of its nearest
 * `ogField`.
 *
 * @example
 * ```html
 * <div ogOtpField #otp="ogOtpField" class="otp" [formField]="verify.code">
 *   <input ogOtpFieldInput />
 *   <div class="cells" aria-hidden="true">
 *     @for (cell of otp.state.cells(); track cell.index) {
 *       <span class="cell" [class.caret]="cell.caret" [class.selected]="cell.selected">{{ cell.char }}</span>
 *     }
 *   </div>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogOtpField]",
  exportAs: "ogOtpField",
  providers: [
    OrigamiOtpFieldOptions.provideExisting(() => OrigamiOtpField),
    OtpFieldContext,
    OrigamiOtpFieldState,
  ],
})
export class OrigamiOtpField implements OrigamiOtpFieldOptions, FormValueControl<string> {
  /**
   * Own value model, default `""`; `valueChange` emits each code an edit writes to this model,
   * synchronously, and never for a value the application writes. `[formField]` binds it. Replaced
   * Options supply the effective value instead and do not fabricate this output.
   */
  readonly value = model("");
  /**
   * Own length input, default 6, coercing a static attribute to a number: the number of digits and
   * cells. A value that isn't a whole number of at least 1 is unsupported. Replaced Options supply
   * it instead.
   */
  readonly length = input(6, { transform: numberAttribute });
  /**
   * Own mask input, default false with boolean-attribute coercion: masks the code as a PIN, the
   * Input `type="password"` and no cell record carrying its digit. Replaced Options supply it
   * instead.
   */
  readonly mask = input(false, { transform: booleanAttribute });
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
  readonly state = inject(OrigamiOtpFieldState);

  readonly #context = inject(OtpFieldContext);

  /** Emits when focus leaves the root's `ogOtpFieldInput`; `[formField]` marks its field touched. */
  readonly touch = outputFromObservable(this.#context.touches);

  /**
   * Focuses the mounted Input; nothing while disabled or before an Input is mounted. Signal Forms'
   * `focusBoundControl()` calls it.
   * @param options - Passed to the Input's native `focus()`.
   */
  focus(options?: FocusOptions): void {
    this.#context.focus(options);
  }
}

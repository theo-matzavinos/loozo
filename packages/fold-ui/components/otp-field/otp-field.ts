import { Component, computed, inject, input } from "@angular/core";
import { OrigamiOtpField } from "@loozo/origami-ui/otp-field";
import { cn } from "../cn";

/**
 * A one-time code or PIN over Origami's OTP field: a row of 40px cells, one per digit, drawn from
 * Origami's cell records, with its OtpFieldInput laid transparently over them. The row's width is
 * its cells', so don't stretch it: a click maps to equal slots of the input's width. Set
 * `--otp-field-cell-size` through `class` for larger cells. Digits always run left to right.
 *
 * @example
 * ```html
 * <div fold__Field>
 *   <label fold__FieldLabel>Verification code</label>
 *   <div fold__OtpField [formField]="login.code">
 *     <input fold__OtpFieldInput />
 *   </div>
 *   <p fold__FieldDescription>The 6-digit code we sent you</p>
 * </div>
 * ```
 */
@Component({
  selector: "[fold__OtpField]",
  exportAs: "fold__OtpField",
  hostDirectives: [
    {
      directive: OrigamiOtpField,
      inputs: ["value", "length", "mask", "disabled", "readonly"],
      outputs: ["valueChange", "touch"],
    },
  ],
  host: { "data-slot": "otp-field", dir: "ltr", "[class]": "classes()" },
  // The cells mirror the input and are hidden from screen readers. A masked cell never has its
  // digit: it shows a dot when filled.
  template: `
    <ng-content />
    @for (cell of state.cells(); track cell.index) {
      <span
        data-slot="otp-field-cell"
        aria-hidden="true"
        [attr.data-filled]="cell.filled || null"
        [attr.data-caret]="cell.caret || null"
        [attr.data-selected]="cell.selected || null"
        [class]="cellClasses"
      >
        @if (cell.filled) {
          @if (state.mask()) {
            <span data-slot="otp-field-dot" [class]="dotClasses"></span>
          } @else {
            {{ cell.char }}
          }
        } @else if (cell.caret) {
          <span data-slot="otp-field-caret" [class]="caretClasses"></span>
        }
      </span>
    }
  `,
})
export class OtpField {
  readonly class = input("");

  readonly #field = inject(OrigamiOtpField);

  /**
   * Origami's readonly observation: `value`, `complete`, `cells`, `focused`, `mask`, `disabled`
   * and `readonly`.
   */
  readonly state = this.#field.state;

  /** Signal Forms' `focusBoundControl()` calls this; it focuses the input. */
  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }

  protected readonly classes = computed(() =>
    cn(
      "group/otp-field relative flex w-max shrink-0 gap-2 rounded-control [--otp-field-cell-size:2.5rem]",
      // No base outline-none, so the ring's outline-style stays solid. A focused input draws it
      // round the whole row, also in a full code, where no cell has the caret.
      "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
      "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50",
      this.class(),
    ),
  );

  // The cells are opted out of forced colors so their borders and fills paint, so each ordinary
  // state color is kept out of forced colors, where only system colors apply.
  protected readonly cellClasses = [
    "group/otp-cell grid size-(--otp-field-cell-size) shrink-0 place-items-center rounded-control border border-input bg-surface",
    "text-[18px] leading-none font-semibold tabular-nums text-foreground",
    "transition-[border-color,background-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
    "group-has-[input[readonly]]/otp-field:border-dashed",
    "not-forced-colors:group-hover/otp-field:border-[color-mix(in_oklab,var(--input),var(--foreground)_35%)]",
    "not-forced-colors:group-has-[input:disabled]/otp-field:border-input",
    "not-forced-colors:group-has-[input[readonly]]/otp-field:not-data-selected:bg-transparent",
    // The caret cell keeps its ring border in an invalid field, so the position stays visible.
    "not-forced-colors:group-has-[input[aria-invalid=true]]/otp-field:not-data-caret:border-destructive-text",
    "not-forced-colors:data-caret:border-ring not-forced-colors:data-selected:bg-foreground/8",
    "forced-color-adjust-none forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]",
    "forced-colors:data-caret:border-[Highlight] forced-colors:data-selected:bg-[Highlight] forced-colors:data-selected:text-[HighlightText]",
    "forced-colors:group-has-[input:disabled]/otp-field:border-[GrayText] forced-colors:group-has-[input:disabled]/otp-field:text-[GrayText]",
  ].join(" ");

  // A masked cell's 8px dot, the radio dot's size.
  protected readonly dotClasses = [
    "size-2 rounded-full bg-foreground forced-colors:bg-[CanvasText] forced-colors:group-data-selected/otp-cell:bg-[HighlightText]",
    "forced-colors:group-has-[input:disabled]/otp-field:bg-[GrayText]",
  ].join(" ");

  // The steady bar in the empty caret cell: type here. A disabled input has no caret cell.
  protected readonly caretClasses = "h-[18px] w-px bg-foreground forced-colors:bg-[CanvasText]";
}

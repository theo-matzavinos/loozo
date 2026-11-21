import { Directive, computed, input } from "@angular/core";
import { OrigamiOtpFieldInput } from "@loozo/origami-ui/otp-field";
import { cn } from "../cn";

/**
 * The OtpField's one native input, laid transparently over the cells: it holds the code, takes
 * focus and is what a screen reader reads; the cells only mirror it. Name it with `aria-label`
 * outside a Field, and write `autocomplete` on a PIN screen. Origami reads its `id` as a static
 * attribute, so write `id="…"` or let a Field generate one, not `[id]`.
 */
@Directive({
  selector: "input[fold__OtpFieldInput]",
  hostDirectives: [OrigamiOtpFieldInput],
  host: { "data-slot": "otp-field-input", "[class]": "classes()" },
})
export class OtpFieldInput {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      // Origami's overlay: exactly the row's box, so a click maps to the cell under it, and no
      // text, caret, selection or outline of its own. It's over the cells, and opted out of forced
      // colors so its glyphs and selection stay unpainted. Its text is 16px, not Origami's 1px,
      // because iOS Safari zooms the page on focus into an input whose text is smaller.
      "absolute inset-0 z-1 m-0 size-full cursor-text border-0 bg-transparent p-0 text-[16px] text-transparent caret-transparent outline-none",
      "selection:bg-transparent selection:text-transparent forced-color-adjust-none disabled:cursor-not-allowed",
      // The browsers' autofill styles set the background and text color with !important, which no
      // author rule beats: hide the whole paint while it's autofilled, and never fill the glyphs.
      "[-webkit-text-fill-color:transparent] autofill:opacity-0",
      this.class(),
    ),
  );
}

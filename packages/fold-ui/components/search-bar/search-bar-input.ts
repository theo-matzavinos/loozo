import { Directive, computed, input } from "@angular/core";
import { OrigamiQueryFieldInput } from "@loozo/origami-ui/query-field";
import { cn } from "../cn";
import { inputClasses } from "../input";

/**
 * A SearchBar's text box, with Input's look: the Field's control and the list's anchor. It has
 * the SearchBar's padding, border and font, so the marks drawn behind it line up with its text,
 * and a transparent background, also in forced colors, so they show through it.
 */
@Directive({
  selector: "input[fold__SearchBarInput]",
  hostDirectives: [{ directive: OrigamiQueryFieldInput, inputs: ["id"] }],
  host: { "data-slot": "search-bar-input", "[class]": "classes()" },
})
export class SearchBarInput {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      inputClasses,
      "h-8",
      // The SearchBar's metrics, which its mark layer shares; the SearchBar paints the surface.
      "relative z-1 ps-(--search-bar-pad-start) pe-(--search-bar-pad-end) border-(length:--search-bar-border) bg-transparent",
      // The SearchBar's font, as the mark row has it: this replaces Input's `text-body`, so the
      // size, weight, line height, letter spacing and features all inherit from the root.
      "text-[length:inherit]",
      // Opted out of forced colors: Chromium paints a Canvas backplate behind a forced input's
      // text, which would cover the marks. The system colors Input gets from forced colors are
      // set back here, above Input's own states; the caret follows the text color.
      "forced-color-adjust-none forced-colors:text-[CanvasText]! forced-colors:border-[CanvasText]!",
      "forced-colors:placeholder:text-[GrayText]! forced-colors:selection:bg-[Highlight]! forced-colors:selection:text-[HighlightText]!",
      "forced-colors:focus-visible:border-[Highlight]! forced-colors:focus-visible:outline-[Highlight]!",
      "forced-colors:disabled:text-[GrayText]! forced-colors:disabled:border-[GrayText]!",
      this.class(),
    ),
  );
}

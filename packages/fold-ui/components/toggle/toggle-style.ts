import type { CnOptions } from "tailwind-variants";
import { buttonVariants, type ButtonSize } from "../button";
import { cn } from "../cn";

/**
 * The on look, from Origami's aria-pressed: the pressed segment's muted body, soft edge and 1px
 * inset border ring, with foreground 600 text. Held, it takes the Button's pressed inset instead
 * of the edge. Shared by Toggle, ToolbarToggle and ToggleGroupItem.
 */
export const pressedClasses = [
  "aria-pressed:bg-muted aria-pressed:font-semibold aria-pressed:text-foreground",
  "aria-pressed:inset-ring aria-pressed:inset-ring-border",
  // Not while held, so the Button's active shadow-pressed shows; without not-active: the two
  // selectors tie on specificity and the edge can stay.
  "aria-pressed:not-data-disabled:not-active:shadow-edge",
  // Tints aren't system colours, so forced colors keeps Highlight instead.
  "not-forced-colors:aria-pressed:not-data-disabled:hover:bg-muted-hover",
  "not-forced-colors:aria-pressed:not-data-disabled:active:bg-muted-pressed",
  // Opt out while pressed so Chromium does not paint a Canvas backplate behind the label.
  "forced-colors:aria-pressed:forced-color-adjust-none forced-colors:aria-pressed:[box-shadow:none]!",
  "forced-colors:aria-pressed:not-data-disabled:bg-[Highlight] forced-colors:aria-pressed:not-data-disabled:text-[HighlightText]",
  "forced-colors:data-disabled:text-[GrayText]",
  "forced-colors:aria-pressed:data-disabled:bg-[GrayText] forced-colors:aria-pressed:data-disabled:text-[Canvas]",
  // Projected text follows the same system colour as the button.
  "forced-colors:aria-pressed:**:text-inherit",
  // Use the Canvas foreground for a focus outline visible outside the pressed body.
  "forced-colors:aria-pressed:focus-visible:outline-[CanvasText]",
];

/** Toggle's look: a ghost Button of the given size that takes the pressed segment's body while on. */
export function toggleClasses(size: ButtonSize, ...classes: CnOptions): string {
  return cn(buttonVariants({ variant: "ghost", size }), pressedClasses, ...classes) ?? "";
}

/** A list option row: highlighted (data-active), selected (data-selected: its end check shows), disabled. */
export const optionClasses = [
  "flex min-h-8 w-full cursor-pointer select-none items-center gap-2 rounded-option px-2 py-1.5 text-body text-foreground outline-none",
  "data-active:bg-foreground/8",
  "data-disabled:cursor-not-allowed data-disabled:opacity-50",
  "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-0 data-selected:[&>svg]:opacity-100",
  // Opted out of forced colors so the highlight paints; every state then names a system colour,
  // and projected text follows the row's (D10).
  "forced-color-adjust-none forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:**:text-inherit",
  "forced-colors:data-active:bg-[Highlight] forced-colors:data-active:text-[HighlightText]",
  "forced-colors:data-disabled:text-[GrayText]",
];

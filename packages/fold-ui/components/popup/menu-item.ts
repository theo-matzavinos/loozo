/** A focusable menu row: real focus is the highlight (also on disabled rows); keyboard focus adds the ring. */
export const menuItemClasses = [
  "flex min-h-8 w-full cursor-pointer select-none items-center gap-2 rounded-option px-2 py-1.5 text-start text-body text-foreground outline-none",
  "focus:bg-foreground/8 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "data-disabled:cursor-not-allowed data-disabled:opacity-50",
  "[&>svg]:size-4 [&>svg]:shrink-0",
  // Opted out of forced colors so the highlight paints; every state names a system color (as optionClasses).
  "forced-color-adjust-none forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:**:text-inherit",
  "forced-colors:focus:bg-[Highlight] forced-colors:focus:text-[HighlightText] forced-colors:focus-visible:outline-[Highlight]",
  "forced-colors:data-disabled:text-[GrayText] forced-colors:data-disabled:focus:text-[HighlightText]",
];

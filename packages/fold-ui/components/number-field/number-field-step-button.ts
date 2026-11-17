/** The − and + buttons' shared look. */
export const stepButtonClasses = [
  "inline-grid aspect-square shrink-0 cursor-pointer place-items-center self-stretch rounded-control-sm text-foreground",
  "transition-[background-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
  "not-data-disabled:hover:bg-foreground/8 not-data-disabled:active:bg-foreground/14",
  // A limit or readonly keeps the button natively enabled, so key on data-disabled; a disabled root
  // already dims the whole box, so a natively disabled button doesn't dim again.
  "data-disabled:cursor-not-allowed not-disabled:data-disabled:opacity-50",
  // Out of the Tab order: the ring is the box's.
  "outline-none [&>svg]:size-4",
  "forced-colors:data-disabled:text-[GrayText]",
];

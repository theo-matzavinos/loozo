/**
 * The segmented track: surface, a 1px input border, 10px radius, 2px padding and gap. Every root
 * resets the status-light dot, so a group inside an indicator group keeps its own.
 */
export const toggleGroupClasses = [
  "inline-flex w-fit items-center gap-0.5 rounded-control border border-input bg-surface p-0.5",
  "data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:*:justify-start",
  // A segment inside a layout-transparent Tooltip root is a grandchild; nested groups keep their own.
  "data-[orientation=vertical]:*:data-[slot=tooltip]:*:justify-start",
  "[--toggle-group-indicator:none] data-indicator:[--toggle-group-indicator:block]",
];

/** A segment: 26px, 7px radius, 10px inline padding, muted-foreground 500 until pressed. */
export const toggleGroupItemClasses = [
  "h-6.5 rounded-segment px-2.5 font-medium text-muted-foreground not-data-disabled:hover:text-foreground",
];

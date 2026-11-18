/** The floating entrance and exit: Origami adds data-entering once the surface is placed and waits for these to finish. */
export const popupMotionClasses = [
  "motion-safe:data-entering:animate-popup-in motion-safe:data-leaving:animate-popup-out",
];

/** A floating surface: list, popover or menu panel. Its own width and padding are yours. */
export const popupClasses = [
  "box-border rounded-menu border border-border bg-surface p-1 text-body text-foreground shadow-popover",
  ...popupMotionClasses,
];

/** A list anchored to its trigger: as wide as it at least, scrolling within the room left. */
export const popupListClasses = [
  "min-w-(--og-anchor-width) max-w-[calc(100vw_-_1rem)] max-h-[min(20rem,calc(var(--og-available-height)_-_8px))]",
  "overflow-y-auto overscroll-contain",
];

/**
 * A disclosure Panel's host: a one-row grid whose track eases between 0fr and 1fr with a fade, so it
 * needs no measured height. A closed until-found Panel keeps a 0fr box, which is where an open starts.
 * A Panel that wasn't rendered before (ordinary `hidden`, or mounted open on the client) starts from
 * `@starting-style`. Origami's Presence waits for these transitions before setting `hidden`.
 * Reduced motion has neither, so the panel snaps. `data-revealing` and `data-concealing` hold a
 * browser reveal's settled layouts without motion (see `snapDisclosureReveal`).
 */
export const disclosurePanelClasses =
  "grid motion-safe:grid-rows-[0fr] motion-safe:opacity-0 " +
  "motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-180 motion-safe:ease-out " +
  "motion-safe:data-expanded:grid-rows-[1fr] motion-safe:data-expanded:opacity-100 " +
  "motion-safe:starting:data-entering:data-expanded:grid-rows-[0fr] " +
  "motion-safe:starting:data-entering:data-expanded:opacity-0 " +
  "data-revealing:grid-rows-[1fr]! data-revealing:opacity-100! data-revealing:transition-none! " +
  "data-concealing:grid-rows-[0fr]! data-concealing:opacity-0! data-concealing:transition-none!";

/** The Panel's one direct child: clips while the track moves, then lets focus rings and popups show. */
export const disclosureClipClasses =
  "min-h-0 overflow-hidden [[data-present]>&]:overflow-visible " +
  "[[data-revealing]>&]:overflow-visible [[data-concealing]>&]:overflow-hidden!";

/**
 * The browser's own reveal of this Panel (find-in-page, an ID or a text fragment): it fires
 * `beforematch`, removes `hidden="until-found"` and then scrolls to the match. Snapping the Panel to
 * its open layout inside the event lets that scroll see the match where it ends up. Origami's own
 * listener has already requested the expansion, so `expanded` reads whether it was accepted: a refused
 * request doesn't snap (the browser still removes `hidden`, but the Panel stays at its closed layout).
 * Returns whether it snapped; a bubbled reveal of a nested Panel and an app's synthetic event don't.
 */
export function snapDisclosureReveal(event: Event, expanded: () => boolean): boolean {
  const host = event.currentTarget;

  if (
    !event.isTrusted ||
    !(host instanceof HTMLElement) ||
    event.target !== host ||
    host.getAttribute("hidden") !== "until-found" ||
    !expanded()
  ) {
    return false;
  }

  holdSettledLayout(host, "data-revealing");

  return true;
}

/** Snaps an open Panel to its closed layout, for a reveal that closes it in the same selection. */
export function snapDisclosureConceal(host: HTMLElement): void {
  holdSettledLayout(host, "data-concealing");
}

/**
 * Two frames: past the browser's scroll and the render where Origami settles the Panel without
 * motion, after which its own state attributes hold the same layout.
 */
function holdSettledLayout(host: HTMLElement, marker: "data-revealing" | "data-concealing"): void {
  host.setAttribute(marker, "");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => host.removeAttribute(marker));
  });
}

/**
 * A disclosure Panel's host: a one-row grid whose track eases between 0fr and 1fr with a fade, so it
 * needs no measured height. A closed until-found Panel keeps a 0fr box, which is where an open starts.
 * A Panel that wasn't rendered before (ordinary `hidden`, or mounted open on the client) starts from
 * `@starting-style`. Origami's Presence waits for these transitions before setting `hidden`.
 * Reduced motion has neither, so the panel snaps.
 */
export const disclosurePanelClasses =
  "grid motion-safe:grid-rows-[0fr] motion-safe:opacity-0 " +
  "motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-180 motion-safe:ease-out " +
  "motion-safe:data-expanded:grid-rows-[1fr] motion-safe:data-expanded:opacity-100 " +
  "motion-safe:starting:data-entering:data-expanded:grid-rows-[0fr] " +
  "motion-safe:starting:data-entering:data-expanded:opacity-0";

/** The Panel's one direct child: clips while the track moves, then lets focus rings and popups show. */
export const disclosureClipClasses = "min-h-0 overflow-hidden [[data-present]>&]:overflow-visible";

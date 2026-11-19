import type { CanMatchFn, UrlSegment } from "@angular/router";
import type { Callbacks } from "./callbacks.js";

/**
 * A group descendant's segments below the group: static text, `":"` for one param, and a final
 * `"**"` for a catchall's rest. Static text never begins with `:` and is never `**`.
 */
export type Claim = readonly string[];

/**
 * A sibling pathless group's ownership guard and its callbacks: a `canMatch` that admits only
 * remaining segments one of `claims` fits, ahead of `base`'s `canMatch` adapters, each of which
 * refuses without calling its callback when none fits. Angular runs `canMatch` before
 * `loadChildren`, so a refusing group loads nothing during recognition.
 *
 * It reads its segments alone: no injector, router state or destination, so the server and the
 * browser decide alike. Angular passes no outlet, so it can't tell a named outlet's segments,
 * tried against the group once that outlet's own routes refuse them, from primary ones.
 */
export function owned(claims: readonly Claim[], base: Callbacks = {}): Callbacks {
  const patterns: readonly Claim[] = Object.freeze(
    claims.map((claim) => Object.freeze([...claim])),
  );

  // Angular's default matcher compares each decoded path exactly; matrix params don't count.
  function fits(segments: readonly UrlSegment[]): boolean {
    for (const claim of patterns) {
      const rest = claim.at(-1) === "**";
      let fixed = claim.length;

      if (rest) {
        fixed -= 1;
      }

      if (segments.length < fixed || (!rest && segments.length !== fixed)) {
        continue;
      }

      let fit = true;

      for (let index = 0; index < fixed; index += 1) {
        if (claim[index] !== ":" && claim[index] !== segments[index].path) {
          fit = false;

          break;
        }
      }

      if (fit) {
        return true;
      }
    }

    return false;
  }

  const guard: CanMatchFn = (_route, segments) => fits(segments);
  const canMatch: CanMatchFn[] = [guard];

  // Angular invokes every canMatch guard even after one refuses, so each adapter checks too.
  for (const adapter of (base.canMatch ?? []) as CanMatchFn[]) {
    canMatch.push((route, segments, snapshot) => {
      if (!fits(segments)) {
        return false;
      }

      return adapter(route, segments, snapshot);
    });
  }

  return { ...base, canMatch };
}

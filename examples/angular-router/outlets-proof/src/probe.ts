import { PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router, type GuardResult, type MaybeAsync } from "@angular/router";

/** What the browser proof reads back: guard and resolver calls, and the held navigation. */
export interface Probe {
  readonly calls: { readonly scope: string; readonly segments: readonly string[] }[];
  homeResolves: number;
  held: boolean;
  readonly release: (() => void)[];
}

function probe(): Probe {
  const proof = globalThis as { proofProbe?: Probe };

  proof.proofProbe ??= { calls: [], homeResolves: 0, held: false, release: [] };

  return proof.proofProbe;
}

function browser(): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID));
}

/**
 * A matching guard that records its calls in the browser and follows the navigation's
 * `guard` query flag: `redirect` sends it to /login, `async` allows it after 2 s.
 */
export function guarded(
  scope: string,
  segments: readonly { path: string }[],
): MaybeAsync<GuardResult> {
  if (!browser()) {
    return true;
  }

  const router = inject(Router);

  probe().calls.push({ scope, segments: segments.map((segment) => segment.path) });

  const mode = router.currentNavigation()?.extractedUrl.queryParamMap.get("guard");

  if (mode === "redirect") {
    return router.parseUrl("/login");
  }

  if (mode === "async") {
    return new Promise((resolve) => setTimeout(() => resolve(true), 2000));
  }

  return true;
}

/** Counts home's resolver runs in the browser. */
export function visit(): number {
  if (browser()) {
    probe().homeResolves += 1;
  }

  return 1;
}

/**
 * Holds the browser's first navigation whose URL carries `hold=1` until the proof releases
 * it, so the first client render runs before any navigation commits.
 */
export function hold(): true | Promise<true> {
  if (!browser()) {
    return true;
  }

  const state = probe();
  const held = inject(Router).currentNavigation()?.extractedUrl.queryParamMap.get("hold") === "1";

  if (!held || state.held) {
    return true;
  }

  state.held = true;

  return new Promise((resolve) => {
    state.release.push(() => resolve(true));
  });
}

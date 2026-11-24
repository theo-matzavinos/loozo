import type { Locator } from "playwright/test";
import { expect } from "./contract-test.js";

/**
 * Pauses `host`'s animations in the page as its exit starts (`data-leaving` appears). Arm it before
 * the action that closes `host`: on a loaded host, the round trips before a retained exit is
 * sampled can outlast it.
 */
export async function pauseExitOnStart(host: Locator): Promise<void> {
  await host.evaluate((node) => {
    const observer = new MutationObserver(() => {
      if (!node.hasAttribute("data-leaving")) {
        return;
      }

      observer.disconnect();

      for (const animation of node.getAnimations()) {
        animation.pause();
      }
    });

    observer.observe(node, { attributes: true, attributeFilter: ["data-leaving"] });
  });
}

/** Resumes animations paused on `host`, so its transition can settle. */
export async function resumeAnimations(host: Locator): Promise<void> {
  await host.evaluate((node) => {
    for (const animation of node.getAnimations()) {
      animation.play();
    }
  });
}

/** What `retainedExit` observed when `host` started leaving. */
type RetainedExit = { finiteAnimations: number };

/**
 * Holds `host`'s exit open while `observe` runs. Before `act`, it arms a page-side observer that
 * pauses `host`'s running finite animations as `data-leaving` appears, so no runner delay between
 * the close and the observation can let the exit finish. Infinite animations keep running. After
 * `observe` returns or throws, one page callback checks and resumes exactly the animations it
 * paused, so nothing can end the exit between the two. When `observe` returned, every one of them
 * must still have been active and paused: one that was cancelled or finished while held fails the
 * case.
 *
 * `act` must start `host`'s exit with at least one running finite animation; `host` must be mounted
 * and not yet leaving when it's called.
 */
export async function retainedExit(
  host: Locator,
  {
    act,
    observe,
  }: {
    act: () => Promise<void>;
    observe: (exit: RetainedExit) => Promise<void>;
  },
): Promise<void> {
  const hold = await host.evaluateHandle((node) => {
    if (!node.isConnected || node.hasAttribute("data-leaving")) {
      throw new Error("Expected a mounted host before its exit");
    }

    function hostAnimations(): Animation[] {
      // Read through the document, so the product's own Element.getAnimations calls stay observable.
      const animations: Animation[] = [];

      for (const animation of document.getAnimations()) {
        if (animation.effect instanceof KeyframeEffect && animation.effect.target === node) {
          animations.push(animation);
        }
      }

      return animations;
    }

    let paused: Animation[] | undefined;
    const observer = new MutationObserver(() => {
      if (!node.hasAttribute("data-leaving")) {
        return;
      }

      observer.disconnect();
      paused = [];

      for (const animation of hostAnimations()) {
        const endTime = animation.effect?.getComputedTiming().endTime;
        const finite = typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0;

        if (animation.playState === "running" && finite) {
          animation.pause();
          paused.push(animation);
        }
      }
    });

    observer.observe(node, { attributes: true, attributeFilter: ["data-leaving"] });

    return {
      count() {
        if (!node.isConnected) {
          throw new Error("Exit host detached before observation");
        }

        return paused?.length;
      },
      /** Resumes the animations still held and returns how many were lost while held. */
      release() {
        observer.disconnect();

        const active = hostAnimations();
        let lost = 0;

        for (const animation of paused ?? []) {
          if (active.includes(animation) && animation.playState === "paused") {
            animation.play();
          } else {
            lost += 1;
          }
        }

        return lost;
      },
    };
  });

  let lost = 0;

  try {
    await act();
    await expect
      .poll(() => hold.evaluate((state) => state.count()), {
        message: `${host.toString()} did not start leaving`,
      })
      .toBeDefined();

    const finiteAnimations = await hold.evaluate((state) => state.count());
    if (!finiteAnimations) {
      throw new Error(`${host.toString()} started leaving without a running finite animation`);
    }

    await observe({ finiteAnimations });
  } finally {
    try {
      lost = await hold.evaluate((state) => state.release());
    } finally {
      await hold.dispose();
    }
  }

  // Reached only when observe returned: a failure in observe propagates from the finally above.
  if (lost > 0) {
    throw new Error(`${host.toString()} lost ${lost} held exit animations before release`);
  }
}

import type { Locator } from "playwright/test";

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

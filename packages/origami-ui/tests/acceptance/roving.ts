import type { Locator } from "playwright/test";

/**
 * Marks what the DOM held inside `container` while `target`'s next `focus` event is dispatched:
 * each `[tabindex]` element's tabindex as `data-focus-tabindex`. The listener is added after
 * Origami's own, so it runs right after the roving focus handled that event, inside the same
 * synchronous `focus()` call an arrow key makes and before any microtask, such as the previous
 * member's blur microtask, or any render.
 */
export async function recordAtNextFocus(container: Locator, target: Locator): Promise<void> {
  const element = await target.elementHandle();

  await container.evaluate((root, focused) => {
    focused!.addEventListener(
      "focus",
      () => {
        for (const member of root.querySelectorAll("[tabindex]")) {
          member.setAttribute("data-focus-tabindex", member.getAttribute("tabindex") ?? "");
        }
      },
      { once: true },
    );
  }, element);
}

/**
 * Marks each `[tabindex]` element's tabindex inside `container` as `data-microtask-tabindex` from
 * a microtask the next keydown's document listener queues. It runs after the microtasks queued
 * before that listener, such as a blur's inside the item's own keydown handler, but not after
 * ones a later listener queues, and before the next scheduled render and its after-render
 * effects; a synchronous `detectChanges()` in a focus handler has already rendered by then.
 */
export async function recordAfterNextKeydown(container: Locator): Promise<void> {
  await container.evaluate((root) => {
    root.ownerDocument.addEventListener(
      "keydown",
      () => {
        queueMicrotask(() => {
          for (const element of root.querySelectorAll("[tabindex]")) {
            element.setAttribute("data-microtask-tabindex", element.getAttribute("tabindex") ?? "");
          }
        });
      },
      { once: true },
    );
  });
}

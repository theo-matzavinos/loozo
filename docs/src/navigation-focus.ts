import { DOCUMENT, ViewportScroller } from "@angular/common";
import { inject } from "@angular/core";
import { NavigationStart, Router, Scroll } from "@angular/router";

/** A navigation in progress, as it began. */
interface Departure {
  readonly id: number;
  readonly movesFocus: boolean;
  readonly focused: Element | null;
}

/**
 * Scrolls to the URL fragment's target of each navigation, and moves focus to the page a link or
 * other in-app navigation opened, so keyboard and screen reader users continue from it: to the
 * fragment's target, or else to the page's heading.
 *
 * It runs on the router's Scroll event for that navigation, which the router emits after the
 * navigation has ended and the page has rendered. The package route resolves content before pages
 * activate, so the page is complete then.
 *
 * The router's own anchor scrolling stays off: it also focuses the target, unconditionally. The
 * router still restores history positions and, for every other navigation, scrolls to the top.
 *
 * Nothing happens when the Scroll event belongs to a navigation that a newer one has replaced.
 * Focus stays where it is when:
 * - the navigation is the initial page load or a history (Back/Forward) navigation: the browser
 *   owns focus on load, and history navigations restore the reader's place instead;
 * - the navigation was skipped because the URL didn't change (a link to the current fragment);
 * - the reader moved focus to another control while the navigation was in progress.
 *
 * Call it in an injection context in the browser only.
 */
export function focusNavigatedPages() {
  const router = inject(Router);
  const scroller = inject(ViewportScroller);
  const document = inject(DOCUMENT);
  let departure: Departure | undefined;

  router.events.subscribe((event) => {
    if (event instanceof NavigationStart) {
      departure = {
        id: event.id,
        movesFocus: router.navigated && event.navigationTrigger !== "popstate",
        focused: document.activeElement,
      };

      return;
    }

    if (!(event instanceof Scroll)) {
      return;
    }

    if (departure !== undefined && event.routerEvent.id < departure.id) {
      return;
    }

    let target: HTMLElement | null = null;

    if (event.anchor !== null) {
      target = document.getElementById(event.anchor);
    }

    // A restored history position wins over the fragment, as with the router's anchor scrolling.
    // The router has no position for history entries from before a page load (undefined).
    // A fragment the page lacks leaves the page at the top.
    const restoresPosition = event.position !== null && event.position !== undefined;

    if (!restoresPosition && target !== null) {
      const fragmentTarget = target;

      // The router handles this Scroll event after this subscriber and scrolls to the top, so
      // scroll once it has. Programmatic scrolling ignores CSS scroll-padding, so reuse the root's
      // scroll-padding-top, which clears the sticky header.
      queueMicrotask(() => {
        const padding = getComputedStyle(document.documentElement).scrollPaddingTop;
        const [, scrollY] = scroller.getScrollPosition();
        const top =
          fragmentTarget.getBoundingClientRect().top + scrollY - Number.parseFloat(padding);

        scroller.scrollToPosition([0, top]);
      });
    }

    if (departure === undefined || event.routerEvent.id !== departure.id || !departure.movesFocus) {
      return;
    }

    const current = document.activeElement;
    const readerMovedFocus =
      current !== departure.focused && current !== null && current !== document.body;

    if (readerMovedFocus) {
      return;
    }

    if (target === null) {
      target = document.querySelector<HTMLElement>("main h1");
    }

    if (target === null) {
      return;
    }

    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }

    target.focus({ preventScroll: true });
  });
}

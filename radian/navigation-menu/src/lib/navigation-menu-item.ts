import {
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { focusFirst } from './utils';
import { RadianNavigationMenuTrigger } from './navigation-menu-trigger';
import { RadianFocusProxy } from './focus-proxy';
import { RadianNavigationMenuItemContext } from './navigation-menu-item-context';

@Directive({
  selector: '[radianNavigationMenuItem]',
  providers: [
    {
      provide: RadianNavigationMenuItemContext,
      useFactory: RadianNavigationMenuItem.contextFactory,
    },
  ],
})
export class RadianNavigationMenuItem {
  value = input(uniqueId('radian-navigation-menu-item'));

  private trigger = contentChild<
    RadianNavigationMenuTrigger,
    ElementRef<HTMLElement>
  >(RadianNavigationMenuTrigger, { read: ElementRef });
  private focusProxy = contentChild<RadianFocusProxy, ElementRef<HTMLElement>>(
    RadianFocusProxy,
    { read: ElementRef },
  );

  private content = contentChild.required<unknown, ElementRef<HTMLElement>>(
    'undefined',
    { read: ElementRef },
  );

  private static contextFactory(): RadianNavigationMenuItemContext {
    const navigationMenuItem = inject(RadianNavigationMenuItem);
    const restoreContentTabOrder = signal(() => {
      return;
    });
    const wasEscapeClose = signal(false);

    const handleContentEntry = (side = 'start') => {
      if (navigationMenuItem.content()) {
        restoreContentTabOrder()();

        const candidates = getTabbableCandidates(
          navigationMenuItem.content().nativeElement,
        );

        if (candidates.length) {
          focusFirst(side === 'start' ? candidates : candidates.reverse());
        }
      }
    };

    const handleContentExit = () => {
      if (navigationMenuItem.content()) {
        const candidates = getTabbableCandidates(
          navigationMenuItem.content().nativeElement,
        );

        if (candidates.length) {
          restoreContentTabOrder.set(removeFromTabOrder(candidates));
        }
      }
    };

    return {
      value: navigationMenuItem.value,
      contentId: computed(() => `${navigationMenuItem.value()}-content`),
      triggerId: computed(() => `${navigationMenuItem.value()}-trigger`),
      trigger: navigationMenuItem.trigger,
      content: navigationMenuItem.content,
      focusProxy: navigationMenuItem.focusProxy,
      wasEscapeClose: wasEscapeClose,
      entryKeyDown: handleContentEntry,
      focusProxyFocused: handleContentEntry,
      rootContentClosed: handleContentExit,
      contentFocusedOutside: handleContentExit,
    };
  }
}

/**
 * Returns a list of potential tabbable candidates.
 *
 * NOTE: This is only a close approximation. For example it doesn't take into account cases like when
 * elements are not visible. This cannot be worked out easily by just reading a property, but rather
 * necessitate runtime knowledge (computed styles, etc). We deal with these cases separately.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
 * Credit: https://github.com/discord/focus-layers/blob/master/src/util/wrapFocus.tsx#L1
 */
function getTabbableCandidates(container: HTMLElement) {
  const nodes: HTMLElement[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    acceptNode: (node: any) => {
      const isHiddenInput = node.tagName === 'INPUT' && node.type === 'hidden';
      if (node.disabled || node.hidden || isHiddenInput)
        return NodeFilter.FILTER_SKIP;
      // `.tabIndex` is not the same as the `tabindex` attribute. It works on the
      // runtime's understanding of tabbability, so this automatically accounts
      // for any kind of element that could be tabbed to.
      return node.tabIndex >= 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
  // we do not take into account the order of nodes with positive `tabIndex` as it
  // hinders accessibility to have tab order different from visual order.
  return nodes;
}

function removeFromTabOrder(candidates: HTMLElement[]) {
  candidates.forEach((candidate) => {
    candidate.dataset['tabindex'] = candidate.getAttribute('tabindex') || '';
    candidate.setAttribute('tabindex', '-1');
  });

  return () => {
    candidates.forEach((candidate) => {
      const prevTabIndex = candidate.dataset['tabindex'] as string;

      candidate.setAttribute('tabindex', prevTabIndex);
    });
  };
}

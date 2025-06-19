import {
  computed,
  Directive,
  ElementRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { RadianNavigationMenuViewportPortal } from './navigation-menu-viewport-portal';
import { RadianNavigationMenuContext } from './navigation-menu-context';
import { RadianNavigationMenuItemContext } from './navigation-menu-item-context';
import { provideRadianFocusGroup } from './focus-group';
import {
  provideRadianDismissibleLayerContext,
  RadianDismissibleLayer,
} from '@loozo/radian/dismissible-layer';
import {
  outputFromObservable,
  outputToObservable,
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';
import { focusFirst } from './utils';

type MotionAttribute = 'to-start' | 'to-end' | 'from-start' | 'from-end';

@Directive({
  selector: '[radianNavigationMenuContent]',
  providers: [
    provideRadianFocusGroup(),
    provideRadianDismissibleLayerContext(() => {
      return {
        disableOutsidePointerEvents: computed(() => false),
      };
    }),
  ],
  hostDirectives: [
    {
      directive: RadianDismissibleLayer,
    },
  ],
  host: {
    '[attr.id]': 'itemContext.contentId()',
    '[attr.aria-labelledby]': 'itemContext.triggerId()',
    '[attr.data-motion]': 'motion()',
    '[attr.data-orientation]': 'context.orientation()',
    '[attr.data-state]': 'state()',
    '[style]': 'style()',
    '(pointerenter)': 'hovered($event)',
    '(pointerleave)': 'unhovered($event)',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianNavigationMenuContent {
  private dismissibleLayer = inject(RadianDismissibleLayer);

  /**
   * Event handler called when the escape key is down.
   * Can be prevented.
   */
  escapeKeyDown = outputFromObservable(
    outputToObservable(this.dismissibleLayer.escapeKeyDown),
  );
  /**
   * Emits when a `pointerdown` event happens outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  pointerDownOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.pointerDownOutside),
  );
  /**
   * Emits when the focus moves outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  focusOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.focusOutside),
  );
  /**
   * Emits when an interaction happens outside the `RadianDismissibleLayer`.
   * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
   * Can be prevented.
   */
  interactionOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.interactionOutside),
  );

  protected context = inject(RadianNavigationMenuContext);
  protected itemContext = inject(RadianNavigationMenuItemContext);

  protected isOpen = computed(
    () => this.context.value() === this.itemContext.value(),
  );
  protected isPortaled = !!inject(RadianNavigationMenuViewportPortal, {
    optional: true,
    self: true,
  });
  protected motion = linkedSignal<
    {
      isSelected: boolean;
      wasSelected: boolean;
      index: number;
      prevIndex: number;
    },
    MotionAttribute | null
  >({
    source: computed(() => {
      const items = this.context.triggers();
      const values = items.map((item) => item.value());

      if (this.context.dir() === 'rtl') {
        values.reverse();
      }

      const index = values.indexOf(this.context.value() ?? '');
      const prevIndex = values.indexOf(this.context.previousValue() ?? '');
      const isSelected = this.itemContext.value() === this.context.value();
      const wasSelected =
        prevIndex === values.indexOf(this.itemContext.value());

      return { isSelected, wasSelected, index, prevIndex };
    }),
    computation: (
      { isSelected, wasSelected, index, prevIndex },
      previous,
    ): MotionAttribute | null => {
      // We only want to update selected and the last selected content
      // this avoids animations being interrupted outside of that range
      if (!isSelected && !wasSelected) {
        return previous?.value ?? null;
      }

      // Don't provide a direction on the initial open
      if (index !== prevIndex) {
        // If we're moving to this item from another
        if (isSelected && prevIndex !== -1)
          return index > prevIndex ? 'from-end' : 'from-start';
        // If we're leaving this item for another
        if (wasSelected && index !== -1)
          return index > prevIndex ? 'to-start' : 'to-end';
      }
      // Otherwise we're entering from closed or leaving the list
      // entirely and should not animate in any direction
      return null;
    },
  });
  protected style = computed(() => ({
    // Prevent interaction when animating out
    pointerEvents: !this.isOpen() && this.context.isRoot ? 'none' : null,
  }));
  private wasEscapeClose = signal(false);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    this.dismissibleLayer.dismissed.subscribe(() =>
      this.context.rootContentDismissed.next(),
    );
    this.dismissibleLayer.focusOutside.subscribe((event) => {
      this.itemContext.contentFocusedOutside();
      const target = event.target as HTMLElement;
      // Only dismiss content when focus moves outside of the menu
      if (this.context.root.contains(target)) {
        event.preventDefault();
      }
    });
    this.dismissibleLayer.pointerDownOutside.subscribe((event) => {
      const target = event.target as HTMLElement;
      const isTrigger = this.context
        .triggers()
        .some((item) => item.elementRef.nativeElement.contains(target));
      const isRootViewport =
        this.context.isRoot &&
        this.context.viewport().nativeElement.contains(target);

      if (isTrigger || isRootViewport || !this.context.isRoot) {
        event.preventDefault();
      }
    });

    if (this.context.isRoot) {
      this.context.rootContentDismissed
        .pipe(takeUntilDestroyed())
        .subscribe(() => {
          this.context.itemDismissed();
          if (this.elementRef.nativeElement.contains(document.activeElement)) {
            this.itemContext.trigger()?.nativeElement.focus();
          }
        });
    }
  }

  protected hovered() {
    if (this.isPortaled) {
      return;
    }

    this.context.contentHovered();
  }

  protected unhovered(event: PointerEvent) {
    if (this.isPortaled) {
      return;
    }

    if (event.pointerType !== 'mouse') {
      return;
    }

    this.context.contentUnhovered();
  }

  protected keyDown(event: KeyboardEvent) {
    const isMetaKey = event.altKey || event.ctrlKey || event.metaKey;
    const isTabKey = event.key === 'Tab' && !isMetaKey;

    if (isTabKey) {
      const candidates = this.getTabbableCandidates(
        event.currentTarget as HTMLElement,
      );
      const focusedElement = document.activeElement;
      const index = candidates.findIndex(
        (candidate) => candidate === focusedElement,
      );
      const isMovingBackwards = event.shiftKey;
      const nextCandidates = isMovingBackwards
        ? candidates.slice(0, index).reverse()
        : candidates.slice(index + 1, candidates.length);

      if (focusFirst(nextCandidates)) {
        // prevent browser tab keydown because we've handled focus
        event.preventDefault();
      } else {
        // If we can't focus that means we're at the edges
        // so focus the proxy and let browser handle
        // tab/shift+tab keypress on the proxy instead
        this.itemContext.focusProxy()?.nativeElement.focus();
      }
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
  private getTabbableCandidates(container: HTMLElement) {
    const nodes: HTMLElement[] = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        acceptNode: (node: any) => {
          const isHiddenInput =
            node.tagName === 'INPUT' && node.type === 'hidden';
          if (node.disabled || node.hidden || isHiddenInput)
            return NodeFilter.FILTER_SKIP;
          // `.tabIndex` is not the same as the `tabindex` attribute. It works on the
          // runtime's understanding of tabbability, so this automatically accounts
          // for any kind of element that could be tabbed to.
          return node.tabIndex >= 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      },
    );
    while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
    // we do not take into account the order of nodes with positive `tabIndex` as it
    // hinders accessibility to have tab order different from visual order.
    return nodes;
  }
}

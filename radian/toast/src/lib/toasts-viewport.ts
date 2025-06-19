import {
  computed,
  contentChild,
  contentChildren,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RadianDismissibleLayerBranch } from '@loozo/radian/dismissible-layer';
import { RadianToastsProviderContext } from './toasts-provider-context';
import { RadianToastsList } from './toasts-list';
import { RadianToast } from './toast';
import { RadianFocusProxy } from './focus-proxy';

@Directive({
  selector: '[radianToastsViewport]',
  hostDirectives: [RadianDismissibleLayerBranch],
  host: {
    role: 'region',
    // Ensure virtual cursor from landmarks menus triggers focus/blur for pause/resume
    tabindex: '-1',
    '[attr.aria-label]': 'ariaLabel()',
    // incase list has size when empty (e.g. padding), we remove pointer events so
    // it doesn't prevent interactions with page elements that it overlays
    '[style]': `{ pointerEvents: hasToasts() ? undefined : 'none' }`,
  },
})
export class RadianToastsViewport {
  /**
   * The keys to use as the keyboard shortcut that will move focus to the toast viewport.
   * @defaultValue ['F8']
   */
  hotkey = input<string[]>(['F8']);
  /**
   * An author-localized label for the toast viewport to provide context for screen reader users
   * when navigating page landmarks. The available `{hotkey}` placeholder will be replaced for you.
   * @defaultValue 'Notifications ({hotkey})'
   */
  label = input<string>('Notifications ({hotkey})');

  protected hotkeyLabel = computed(() =>
    this.hotkey().join('+').replace(/Key/g, '').replace(/Digit/g, ''),
  );
  protected ariaLabel = computed(() =>
    this.label().replace('{hotkey}', this.hotkeyLabel()),
  );
  protected hasToasts = computed(() => !!this.context.toastsCount());

  protected context = inject(RadianToastsProviderContext);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private toastsList = contentChild.required<
    RadianToastsList,
    ElementRef<HTMLElement>
  >(RadianToastsList, { read: ElementRef });
  private toasts = contentChildren(RadianToast, { read: ElementRef });
  private focusProxies = contentChildren<
    RadianFocusProxy,
    ElementRef<HTMLElement>
  >(RadianFocusProxy, { read: ElementRef });
  private headFocusProxy = computed<ElementRef<HTMLElement> | undefined>(
    () => this.focusProxies()[0],
  );
  private tailFocusProxy = computed<ElementRef<HTMLElement> | undefined>(
    () => this.focusProxies()[0],
  );

  constructor() {
    const pause = () => {
      this.context.isClosePaused.set(true);
    };

    const resume = () => {
      this.context.isClosePaused.set(false);
    };

    const resumeAfterFocusOut = (event: FocusEvent) => {
      const isFocusMovingOutside = !this.elementRef.nativeElement.contains(
        event.relatedTarget as HTMLElement,
      );

      if (isFocusMovingOutside) {
        this.context.isClosePaused.set(false);
      }
    };

    const resumeAfterUnhovered = () => {
      const isFocusInside = this.elementRef.nativeElement.contains(
        document.activeElement,
      );

      if (!isFocusInside) {
        this.context.isClosePaused.set(false);
      }
    };

    effect((onCleanup) => {
      if (!this.hasToasts()) {
        return;
      }

      const element = this.elementRef.nativeElement;

      element.addEventListener('focusin', pause);
      element.addEventListener('pointermove', pause);
      element.addEventListener('blur', pause);
      element.addEventListener('focus', resume);
      element.addEventListener('focusout', resumeAfterFocusOut);
      element.addEventListener('pointerleave', resumeAfterUnhovered);

      onCleanup(() => {
        element.removeEventListener('focusin', pause);
        element.removeEventListener('pointermove', pause);
        element.removeEventListener('blur', pause);
        element.removeEventListener('focus', resume);
        element.removeEventListener('focusout', resumeAfterFocusOut);
        element.removeEventListener('pointerleave', resumeAfterUnhovered);
      });
    });

    effect((onCleanup) => {
      const toastsList = this.toastsList().nativeElement;

      const handleKeyDown = (event: KeyboardEvent) => {
        const isMetaKey = event.altKey || event.ctrlKey || event.metaKey;
        const isTabKey = event.key === 'Tab' && !isMetaKey;

        if (isTabKey) {
          const focusedElement = document.activeElement;
          const isTabbingBackwards = event.shiftKey;
          const targetIsViewport = event.target === toastsList;

          // If we're back tabbing after jumping to the viewport then we simply
          // proxy focus out to the preceding document
          if (targetIsViewport && isTabbingBackwards) {
            this.headFocusProxy()?.nativeElement?.focus();

            return;
          }

          const tabbingDirection = isTabbingBackwards
            ? 'backwards'
            : 'forwards';
          const sortedCandidates = this.getSortedTabbableCandidates({
            tabbingDirection,
          });
          const index = sortedCandidates.findIndex(
            (candidate) => candidate === focusedElement,
          );

          if (focusFirst(sortedCandidates.slice(index + 1))) {
            event.preventDefault();
          } else {
            // If we can't focus that means we're at the edges so we
            // proxy to the corresponding exit point and let the browser handle
            // tab/shift+tab keypress and implicitly pass focus to the next valid element in the document
            isTabbingBackwards
              ? this.headFocusProxy()?.nativeElement?.focus()
              : this.tailFocusProxy()?.nativeElement?.focus();
          }
        }
      };

      // Toasts are not in the viewport React tree so we need to bind DOM events
      toastsList.addEventListener('keydown', handleKeyDown);

      onCleanup(() => toastsList.removeEventListener('keydown', handleKeyDown));
    });

    const isFocusFromOutside = (event: FocusEvent) => {
      const prevFocusedElement = event.relatedTarget as HTMLElement | null;

      return !this.context.list()?.nativeElement.contains(prevFocusedElement);
    };

    effect(() => {
      if (!this.focusProxies().length) {
        return;
      }

      this.focusProxies()[0].nativeElement.addEventListener(
        'focus',
        (event) => {
          if (isFocusFromOutside(event)) {
            const tabbableCandidates = this.getSortedTabbableCandidates({
              tabbingDirection: 'forwards',
            });
            focusFirst(tabbableCandidates);
          }
        },
      );

      this.focusProxies()[1].nativeElement.addEventListener(
        'focus',
        (event) => {
          if (isFocusFromOutside(event)) {
            const tabbableCandidates = this.getSortedTabbableCandidates({
              tabbingDirection: 'backwards',
            });
            focusFirst(tabbableCandidates);
          }
        },
      );
    });
  }

  protected documentKeyDown(event: KeyboardEvent) {
    // we use `event.code` as it is consistent regardless of meta keys that were pressed.
    // for example, `event.key` for `Control+Alt+t` is `†` and `t !== †`
    const isHotkeyPressed =
      this.hotkey().length !== 0 &&
      this.hotkey().every((key) => (event as any)[key] || event.code === key);

    if (isHotkeyPressed) {
      this.toastsList().nativeElement.focus();
    }
  }

  private getSortedTabbableCandidates({
    tabbingDirection,
  }: {
    tabbingDirection: 'forwards' | 'backwards';
  }) {
    const toastItems = this.toasts();
    const tabbableCandidates = toastItems.map((toastItem) => {
      const toastNode = toastItem.nativeElement;
      const toastTabbableCandidates = [
        toastNode,
        ...getTabbableCandidates(toastNode),
      ];

      return tabbingDirection === 'forwards'
        ? toastTabbableCandidates
        : toastTabbableCandidates.reverse();
    });

    return (
      tabbingDirection === 'forwards'
        ? tabbableCandidates.reverse()
        : tabbableCandidates
    ).flat();
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

function focusFirst(candidates: HTMLElement[]) {
  const previouslyFocusedElement = document.activeElement;
  return candidates.some((candidate) => {
    // if focus is already where we want to go, we don't want to keep going through the candidates
    if (candidate === previouslyFocusedElement) return true;
    candidate.focus();
    return document.activeElement !== previouslyFocusedElement;
  });
}

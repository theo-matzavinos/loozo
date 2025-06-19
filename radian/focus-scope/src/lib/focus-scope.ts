import {
  afterNextRender,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  OnDestroy,
  output,
  Provider,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';

const AUTOFOCUS_ON_MOUNT = 'focusScope.autoFocusOnMount';
const AUTOFOCUS_ON_UNMOUNT = 'focusScope.autoFocusOnUnmount';
const EVENT_OPTIONS = { bubbles: false, cancelable: true };

export type RadianFocusScopeContext = {
  /**
   * When `true`, tabbing from last item will focus first tabbable
   * and shift+tab from first item will focus last tababble.
   * @defaultValue false
   */
  loop: Signal<boolean>;

  /**
   * When `true`, focus cannot escape the focus scope via keyboard,
   * pointer, or a programmatic focus.
   * @defaultValue false
   */
  trapped: Signal<boolean>;
};

export const RadianFocusScopeContext = new InjectionToken<
  () => RadianFocusScopeContext
>('[Radian] Focus Scope Context');

export function provideRadianFocusScopeContext(
  factory: () => () => RadianFocusScopeContext,
): Provider {
  return { provide: RadianFocusScopeContext, useFactory: factory };
}

const RadianFocusScopesStack = new InjectionToken(
  '[Radian] Focus Scopes Stack',
  {
    factory() {
      /** A stack of focus scopes, with the active one at the top */
      let stack: { paused: WritableSignal<boolean> }[] = [];

      return {
        add(focusScope: { paused: WritableSignal<boolean> }) {
          // pause the currently active focus scope (at the top of the stack)
          const activeFocusScope = stack[0];
          if (focusScope !== activeFocusScope) {
            activeFocusScope?.paused.set(true);
          }
          // remove in case it already exists (because we'll re-add it at the top of the stack)
          stack = stack.filter((v) => v !== focusScope);
          stack.unshift(focusScope);
        },

        remove(focusScope: { paused: WritableSignal<boolean> }) {
          stack = stack.filter((v) => v !== focusScope);
          stack[0]?.paused.set(false);
        },
      };
    },
  },
);

@Directive({
  host: {
    tabindex: '-1',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianFocusScope implements OnDestroy {
  /**
   * Event handler called when auto-focusing on mount.
   * Can be prevented.
   */
  mountAutoFocus = output<Event>();

  /**
   * Event handler called when auto-focusing on unmount.
   * Can be prevented.
   */
  unmountAutoFocus = output<Event>();

  private paused = signal(false);
  private lastFocusedElement = signal<HTMLElement | null>(null);
  private stack = inject(RadianFocusScopesStack);
  private contextFactory = inject(RadianFocusScopeContext);
  private context?: RadianFocusScopeContext;
  private previouslyFocusedElement?: HTMLElement;

  constructor() {
    const injector = inject(Injector);
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    // Takes care of trapping focus if focus is moved outside programmatically for example

    afterNextRender(() => {
      this.context = this.contextFactory();
      const handleFocusIn = (event: FocusEvent) => {
        if (this.paused()) {
          return;
        }
        const target = event.target as HTMLElement | null;
        if (elementRef.nativeElement.contains(target)) {
          this.lastFocusedElement.set(target);
        } else {
          this.focus(this.lastFocusedElement(), { select: true });
        }
      };

      const handleFocusOut = (event: FocusEvent) => {
        if (this.paused()) {
          return;
        }

        const relatedTarget = event.relatedTarget as HTMLElement | null;

        // A `focusout` event with a `null` `relatedTarget` will happen in at least two cases:
        //
        // 1. When the user switches app/tabs/windows/the browser itself loses focus.
        // 2. In Google Chrome, when the focused element is removed from the DOM.
        //
        // We let the browser do its thing here because:
        //
        // 1. The browser already keeps a memory of what's focused for when the page gets refocused.
        // 2. In Google Chrome, if we try to focus the deleted focused element (as per below), it
        //    throws the CPU to 100%, so we avoid doing anything for this reason here too.
        if (relatedTarget === null) {
          return;
        }

        // If the focus has moved to an actual legitimate element (`relatedTarget !== null`)
        // that is outside the container, we move focus to the last valid focused element inside.
        if (!elementRef.nativeElement.contains(relatedTarget)) {
          this.focus(this.lastFocusedElement(), { select: true });
        }
      };
      // When the focused element gets removed from the DOM, browsers move focus
      // back to the document.body. In this case, we move focus to the container
      // to keep focus trapped correctly.
      const handleMutations = (mutations: MutationRecord[]) => {
        const focusedElement = document.activeElement as HTMLElement | null;

        if (focusedElement !== document.body) {
          return;
        }

        for (const mutation of mutations) {
          if (mutation.removedNodes.length > 0) {
            this.focus(elementRef.nativeElement);
          }
        }
      };

      effect(
        (onCleanup) => {
          if (this.context?.trapped()) {
            document.addEventListener('focusin', handleFocusIn);
            document.addEventListener('focusout', handleFocusOut);

            const mutationObserver = new MutationObserver(handleMutations);

            mutationObserver.observe(elementRef.nativeElement, {
              childList: true,
              subtree: true,
            });

            onCleanup(() => {
              document.removeEventListener('focusin', handleFocusIn);
              document.removeEventListener('focusout', handleFocusOut);
              mutationObserver.disconnect();
            });
          }
        },
        { injector },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.stack.add(this as any);

      this.previouslyFocusedElement =
        (document.activeElement as HTMLElement) ?? undefined;
      const hasFocusedCandidate = elementRef.nativeElement.contains(
        this.previouslyFocusedElement,
      );

      if (!hasFocusedCandidate) {
        const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT, EVENT_OPTIONS);

        this.mountAutoFocus.emit(mountEvent);

        if (!mountEvent.defaultPrevented) {
          this.focusFirst(
            this.removeLinks(
              this.getTabbableCandidates(elementRef.nativeElement),
            ),
            {
              select: true,
            },
          );
          if (document.activeElement === this.previouslyFocusedElement) {
            this.focus(elementRef.nativeElement);
          }
        }
      }
    });
  }

  ngOnDestroy() {
    const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, EVENT_OPTIONS);
    this.unmountAutoFocus.emit(unmountEvent);

    if (!unmountEvent.defaultPrevented) {
      this.focus(this.previouslyFocusedElement ?? document.body, {
        select: true,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.stack.remove(this as any);
  }

  protected keyDown(event: KeyboardEvent) {
    if (!this.context?.loop() && !this.context?.trapped()) {
      return;
    }

    if (this.paused()) {
      return;
    }

    const isTabKey =
      event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
    const focusedElement = document.activeElement as HTMLElement | null;

    if (isTabKey && focusedElement) {
      const container = event.currentTarget as HTMLElement;
      const [first, last] = this.getTabbableEdges(container);
      const hasTabbableElementsInside = first && last;

      // we can only wrap focus if we have tabbable edges
      if (!hasTabbableElementsInside) {
        if (focusedElement === container) {
          event.preventDefault();
        }

        return;
      }

      if (!event.shiftKey && focusedElement === last) {
        event.preventDefault();
        if (this.context.loop()) {
          this.focus(first, { select: true });
        }
      } else if (event.shiftKey && focusedElement === first) {
        event.preventDefault();
        if (this.context.loop()) {
          this.focus(last, { select: true });
        }
      }
    }
  }

  private focus(element?: HTMLElement | null, { select = false } = {}) {
    // only focus if that element is focusable
    if (element && element.focus) {
      const previouslyFocusedElement = document.activeElement;
      // NOTE: we prevent scrolling on focus, to minimize jarring transitions for users
      element.focus({ preventScroll: true });
      // only select if its not the same element, it supports selection and we need to select
      if (
        element !== previouslyFocusedElement &&
        this.isSelectableInput(element) &&
        select
      ) {
        element.select();
      }
    }
  }

  private isSelectableInput(
    element: HTMLElement,
  ): element is HTMLElement & { select: () => void } {
    return element instanceof HTMLInputElement && 'select' in element;
  }

  private focusFirst(candidates: HTMLElement[], { select = false } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates) {
      this.focus(candidate, { select });
      if (document.activeElement !== previouslyFocusedElement) return;
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

  private removeLinks(items: HTMLElement[]) {
    return items.filter((item) => item.tagName !== 'A');
  }

  private getTabbableEdges(container: HTMLElement) {
    const candidates = this.getTabbableCandidates(container);
    const first = this.findVisible(candidates, container);
    const last = this.findVisible(candidates.reverse(), container);

    return [first, last] as const;
  }

  /**
   * Returns the first visible element in a list.
   * NOTE: Only checks visibility up to the `container`.
   */
  private findVisible(elements: HTMLElement[], container: HTMLElement) {
    for (const element of elements) {
      // we stop checking if it's hidden at the `container` level (excluding)
      if (!this.isHidden(element, { upTo: container })) {
        return element;
      }
    }

    return;
  }

  private isHidden(node: HTMLElement, { upTo }: { upTo?: HTMLElement }) {
    if (getComputedStyle(node).visibility === 'hidden') {
      return true;
    }

    while (node) {
      // we stop at `upTo` (excluding it)
      if (upTo !== undefined && node === upTo) {
        return false;
      }

      if (getComputedStyle(node).display === 'none') {
        return true;
      }

      node = node.parentElement as HTMLElement;
    }

    return false;
  }
}

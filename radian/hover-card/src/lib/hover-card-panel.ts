import {
  afterNextRender,
  afterEveryRender,
  booleanAttribute,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { RadianHoverCardContext } from './hover-card-context';
import {
  provideRadianDismissibleLayerContext,
  RadianDismissibleLayer,
} from '@loozo/radian/dismissible-layer';
import {
  RadianPopperPanel,
  RadianPopperAlignment,
  RadianPopperSide,
} from '@loozo/radian/popper';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';

let originalBodyUserSelect: string;

@Directive({
  selector: '[radianHoverCardPanel]',
  providers: [
    provideRadianDismissibleLayerContext(() => ({
      disableOutsidePointerEvents: computed(() => false),
    })),
  ],
  hostDirectives: [
    {
      directive: RadianPopperPanel,
      inputs: [
        'side',
        'sideOffset',
        'align',
        'alignOffset',
        'arrowPadding',
        'avoidCollisions',
        'collisionBoundary',
        'collisionPadding',
        'sticky',
        'hideWhenDetached',
        'updatePositionStrategy',
      ],
    },
    { directive: RadianDismissibleLayer },
  ],
  host: {
    '[style]': 'style()',
    '[attr.data-state]': `context.isOpen() ? 'open' : 'closed'`,
    '(pointerenter)': '$event.pointerType !== "touch" && context.open()',
    '(pointerleave)': '$event.pointerType !== "touch" && context.close()',
    '(pointerdown)': 'pointerDown($event)',
  },
})
export class RadianHoverCardPanel {
  /**
   * The preferred side of the anchor to render against when open.
   * Will be reversed when collisions occur and avoidCollisions is enabled.
   */
  side = input<RadianPopperSide>(RadianPopperSide.Bottom);
  /** The distance in pixels from the anchor. */
  sideOffset = input(0, { transform: numberAttribute });
  /** The preferred alignment against the anchor. May change when collisions occur. */
  align = input<RadianPopperAlignment>(RadianPopperAlignment.Center);
  /** An offset in pixels from the `start` or `end` alignment options. */
  alignOffset = input(0, { transform: numberAttribute });
  /**
   * The padding between the arrow and the edges of the content.
   * If your content has border-radius, this will prevent it from overflowing the corners.
   */
  arrowPadding = input(0, { transform: numberAttribute });
  /** When `true`, overrides the `side` and `align` preferences to prevent collisions with boundary edges. */
  avoidCollisions = input(true, { transform: booleanAttribute });
  /**
   * The element used as the collision boundary.
   * By default this is the viewport, though you can provide additional element(s) to be included in this check.
   */
  collisionBoundary = input<
    ElementRef<HTMLElement> | ElementRef<HTMLElement>[]
  >();
  /**
   * The distance in pixels from the boundary edges where collision detection should occur.
   * Accepts a number (same for all sides), or a partial padding object, for example: `{ top: 20, left: 20 }`.
   */
  collisionPadding = input<number | Partial<Record<RadianPopperSide, number>>>(
    0,
  );
  /**
   * The sticky behavior on the `align` axis.
   * - `partial` will keep the content in the boundary as long as the trigger is at least partially in the boundary
   * - `always` will keep the content in the boundary regardless.
   */
  sticky = input<'partial' | 'always'>('partial');
  /** Whether to hide the content when the trigger becomes fully occluded. */
  hideWhenDetached = input(false, { transform: booleanAttribute });
  /** Whether to update the position of the floating element on every animation frame if required. */
  updatePositionStrategy = input<'optimized' | 'always'>('optimized');

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

  protected context = inject(RadianHoverCardContext);
  protected style = computed(() => ({
    userSelect: this.containsSelection() ? 'text' : undefined,
    // Safari requires prefix
    WebkitUserSelect: this.containsSelection() ? 'text' : undefined,
    // re-namespace exposed content custom properties
    '--radian-hover-card-content-transform-origin':
      'var(--radian-popper-transform-origin)',
    '--radian-hover-card-content-available-width':
      'var(--radian-popper-available-width)',
    '--radian-hover-card-content-available-height':
      'var(--radian-popper-available-height)',
    '--radian-hover-card-trigger-width': 'var(--radian-popper-anchor-width)',
    '--radian-hover-card-trigger-height': 'var(--radian-popper-anchor-height)',
  }));

  private containsSelection = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    afterNextRender(() => {
      const handlePointerUp = () => {
        this.containsSelection.set(false);
        this.context.isPointerDownOnContent.set(false);

        // Delay a frame to ensure we always access the latest selection
        setTimeout(() => {
          const hasSelection = document.getSelection()?.toString() !== '';
          if (hasSelection) {
            this.context.hasSelection.set(true);
          }
        });
      };

      document.addEventListener('pointerup', handlePointerUp);

      destroyRef.onDestroy(() => {
        document.removeEventListener('pointerup', handlePointerUp);
        this.context.hasSelection.set(false);
        this.context.isPointerDownOnContent.set(false);
      });
    });

    afterEveryRender(() => {
      const tabbables = this.getTabbableNodes(elementRef.nativeElement);

      tabbables.forEach((tabbable) => tabbable.setAttribute('tabindex', '-1'));
    });

    effect((onCleanup) => {
      if (this.containsSelection()) {
        const body = document.body;

        // Safari requires prefix
        originalBodyUserSelect =
          body.style.userSelect || body.style.webkitUserSelect;

        body.style.userSelect = 'none';
        body.style.webkitUserSelect = 'none';

        onCleanup(() => {
          body.style.userSelect = originalBodyUserSelect;
          body.style.webkitUserSelect = originalBodyUserSelect;
        });
      }
    });

    const dismissibleLayer = inject(RadianDismissibleLayer);

    dismissibleLayer.focusOutside.subscribe((e) => e.preventDefault());
    dismissibleLayer.dismissed.subscribe(() => this.context.dismiss());
  }

  protected pointerDown(event: PointerEvent) {
    // Contain selection to current layer
    if (
      (event.currentTarget as HTMLElement).contains(event.target as HTMLElement)
    ) {
      this.containsSelection.set(true);
    }
    this.context.hasSelection.set(false);
    this.context.isPointerDownOnContent.set(true);
  }

  /**
   * Returns a list of nodes that can be in the tab sequence.
   * @see: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  private getTabbableNodes(container: HTMLElement) {
    const nodes: HTMLElement[] = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        acceptNode: (node: any) => {
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
    return nodes;
  }
}

import {
  afterNextRender,
  booleanAttribute,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { RadianDismissibleLayer } from '@loozo/radian/dismissible-layer';
import { RadianPopperPanel } from '@loozo/radian/popper';
import { RadianPopperAlignment } from 'radian/popper/src/lib/popper';
import { RadianPopperSide } from 'radian/popper/src/lib/popper-context';
import { RadianTooltipContext } from './tooltip';
import {
  outputFromObservable,
  outputToObservable,
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';

@Directive({
  selector: '[radianTooltipPanel]',
  hostDirectives: [
    RadianDismissibleLayer,
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
  ],
  host: {
    '[attr.data-state]': 'context.state()',
    // re-namespace exposed content custom properties
    '[style]': `{
      '--radian-tooltip-content-transform-origin': 'var(--radian-popper-transform-origin)',
      '--radian-tooltip-content-available-width': 'var(--radian-popper-available-width)',
      '--radian-tooltip-content-available-height': 'var(--radian-popper-available-height)',
      '--radian-tooltip-trigger-width': 'var(--radian-popper-anchor-width)',
      '--radian-tooltip-trigger-height': 'var(--radian-popper-anchor-height)',
    }`,
  },
})
export class RadianTooltipPanel {
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
  /** Emits when the element is placed. */
  placed = outputFromObservable(
    outputToObservable(inject(RadianPopperPanel).placed),
  );
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

  constructor() {
    const dismissibleLayer = inject(RadianDismissibleLayer);
    const context = inject(RadianTooltipContext);

    dismissibleLayer.focusOutside.subscribe((e) => e.preventDefault());
    dismissibleLayer.dismissed.subscribe(() => context.close());

    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const handleScroll = (event: Event) => {
        const target = event.target as HTMLElement;

        if (target?.contains(context.trigger().elementRef.nativeElement)) {
          context.close();
        }
      };

      window.addEventListener('scroll', handleScroll, { capture: true });
      context.tooltipOpen.pipe(takeUntilDestroyed()).subscribe(context.close);

      destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', handleScroll, { capture: true });
      });
    });
  }
}

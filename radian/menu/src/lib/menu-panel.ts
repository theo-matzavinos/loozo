import {
  booleanAttribute,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import {
  RadianPopperAlignment,
  RadianPopperPanel,
  RadianPopperSide,
} from '@loozo/radian/popper';
import { RadianMenuContext } from './menu-context';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import {
  provideRadianDismissibleLayerContext,
  RadianDismissibleLayer,
} from '@loozo/radian/dismissible-layer';
import {
  provideRadianRemoveScrollContext,
  RadianRemoveScroll,
} from '@loozo/radian/remove-scroll';
import { RadianFocusGuards } from '@loozo/radian/focus-guards';

@Directive({
  selector: '[radianMenuPanel]',
  providers: [
    provideRadianRemoveScrollContext(() => {
      const context = inject(RadianMenuContext);

      return {
        enabled: context.modal,
        allowPinchZoom: true,
      };
    }),
    provideRadianDismissibleLayerContext(() => {
      const context = inject(RadianMenuContext);

      return {
        disableOutsidePointerEvents: computed(
          () => context.modal() && context.open(),
        ),
      };
    }),
  ],
  hostDirectives: [
    RadianFocusGuards,
    RadianRemoveScroll,
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
})
export class RadianMenuPanel {
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

  escapeKeyDown = outputFromObservable(
    outputToObservable(this.dismissibleLayer.escapeKeyDown),
  );
  pointerDownOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.pointerDownOutside),
  );
  focusOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.focusOutside),
  );
  interactionOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.interactionOutside),
  );

  constructor() {
    const context = inject(RadianMenuContext);

    this.dismissibleLayer.dismissed.subscribe(() => context.close());
    // When focus is trapped, a `focusout` event may still happen.
    // We make sure we don't trigger our `dismissed` in such case.
    this.dismissibleLayer.focusOutside.subscribe((e) => e.preventDefault());
  }
}

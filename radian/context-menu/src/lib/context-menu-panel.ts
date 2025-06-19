import {
  booleanAttribute,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
  output,
  signal,
} from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianMenu, RadianMenuPanel } from '@loozo/radian/menu';
import {
  RadianPopperSide,
  provideRadianPopperPanelDefaults,
} from '@loozo/radian/popper';
import { RadianContextMenuContentContext } from './context-menu-content-context';

@Directive({
  selector: '[radianContextMenuPanel]',
  providers: [
    {
      provide: RadianContextMenuContentContext,
      useFactory: RadianContextMenuPanel.contextFactory,
    },
    provideRadianPopperPanelDefaults({
      side: 'right',
      sideOffset: 2,
      align: 'start',
    }),
  ],
  hostDirectives: [
    {
      directive: RadianMenuPanel,
      inputs: [
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
export class RadianContextMenuPanel {
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

  private menuPanel = inject(RadianMenuPanel);
  escapeKeyDown = outputFromObservable(
    outputToObservable(this.menuPanel.escapeKeyDown),
  );
  pointerDownOutside = outputFromObservable(
    outputToObservable(this.menuPanel.pointerDownOutside),
  );
  focusOutside = outputFromObservable(
    outputToObservable(this.menuPanel.focusOutside),
  );
  interactionOutside = output<Event>();

  private static contextFactory(): RadianContextMenuContentContext {
    const menu = inject(RadianMenu);
    const menuPanel = inject(RadianMenuPanel);
    const contextMenuPanel = inject(RadianContextMenuPanel);
    const hasInteractedOutside = signal(false);

    menuPanel.interactionOutside.subscribe((event) => {
      contextMenuPanel.interactionOutside.emit(event);

      if (!event.defaultPrevented && !menu.modal()) {
        hasInteractedOutside.set(true);
      }
    });

    return { hasInteractedOutside };
  }
}

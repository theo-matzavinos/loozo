import {
  booleanAttribute,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import {
  RadianPopperAlignment,
  RadianPopperPanel,
  RadianPopperPanelDefaults,
  RadianPopperSide,
} from '@loozo/radian/popper';
import { RadianMenuContext, RadianRootMenuContext } from './menu-context';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import {
  provideRadianDismissibleLayerContext,
  RadianDismissibleLayer,
} from '@loozo/radian/dismissible-layer';
import { provideRadianRemoveScrollContext } from '@loozo/radian/remove-scroll';
import { Direction } from '@loozo/radian/common';
import { RadianSubMenuContext } from './sub-menu-context';

const SUB_CLOSE_KEYS: Record<Direction, string[]> = {
  ltr: ['ArrowLeft'],
  rtl: ['ArrowRight'],
};

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
      return {
        disableOutsidePointerEvents: computed(() => false),
      };
    }),
    {
      provide: RadianPopperPanelDefaults,
      useFactory() {
        const rootContext = inject(RadianRootMenuContext);

        return {
          align: 'start',
          side: rootContext.dir() === 'rtl' ? 'left' : 'right',
        };
      },
    },
  ],
  hostDirectives: [
    RadianDismissibleLayer,
    {
      directive: RadianPopperPanel,
      inputs: [
        'side',
        'sideOffset',
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
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianSubMenuPanel {
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

  private context = inject(RadianMenuContext);
  private rootContext = inject(RadianRootMenuContext);
  private subContext = inject(RadianSubMenuContext);

  constructor() {
    const context = inject(RadianMenuContext);

    this.dismissibleLayer.dismissed.subscribe(() => context.close());
    // When focus is trapped, a `focusout` event may still happen.
    // We make sure we don't trigger our `dismissed` in such case.
    this.dismissibleLayer.focusOutside.subscribe((event) => {
      // We prevent closing when the trigger is focused to avoid triggering a re-open animation
      // on pointer interaction.
      if (event.target !== this.subContext.trigger()) {
        this.context.setOpen(false);
      }
    });
    this.dismissibleLayer.escapeKeyDown.subscribe((event) => {
      this.rootContext.close();
      // ensure pressing escape in submenu doesn't escape full screen mode
      event.preventDefault();
    });

    const popperPanel = inject(RadianPopperPanel);

    effect(() => {
      const dir = context.dir();

      popperPanel.setSide(dir === 'rtl' ? 'left' : 'right');
    });
  }

  protected keyDown(event: KeyboardEvent) {
    // Submenu key events bubble through portals. We only care about keys in this menu.
    const isKeyDownInside = (event.currentTarget as HTMLElement).contains(
      event.target as HTMLElement,
    );
    const isCloseKey = SUB_CLOSE_KEYS[this.rootContext.dir()].includes(
      event.key,
    );
    if (isKeyDownInside && isCloseKey) {
      this.context.setOpen(false);
      // We focus manually because we prevented it in `onCloseAutoFocus`
      this.subContext.trigger()?.focus();
      // prevent window from scrolling
      event.preventDefault();
    }
  }
}

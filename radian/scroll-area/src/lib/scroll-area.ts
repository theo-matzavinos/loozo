import {
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import { Direction, RadianDirection } from '@loozo/radian/common';
import { RadianScrollAreaContext } from './scroll-area-context';
import { RadianScrollAreaContent } from './scroll-area-content';
import { RadianScrollAreaHorizontalScrollbar } from './scroll-area-horizontal-scrollbar';
import { RadianScrollAreaVerticalScrollbar } from './scroll-area-vertical-scrollbar';
import { RadianScrollAreaScrollbarAutoPresence } from './scroll-area-scrollbar-auto-presence';
import { RadianScrollAreaScrollbarScrollPresence } from './scroll-area-scrollbar-scroll-presence';
import { RadianScrollAreaScrollbarHoverPresence } from './scroll-area-scrollbar-hover-presence';
import { RadianScrollAreaViewport } from './scroll-area-viewport';

@Directive({
  selector: '[radianScrollArea]',
  providers: [
    {
      provide: RadianScrollAreaContext,
      useFactory: RadianScrollArea.contextFactory,
    },
  ],
  hostDirectives: [
    { directive: RadianDirection, inputs: ['radianDirection:dir'] },
  ],
  host: {
    // Pass corner sizes as CSS vars to reduce re-renders of context consumers
    '[style]': `{
      position: 'relative',
      '--radian-scroll-area-corner-width': cornerWidth() + 'px',
      '--radian-scroll-area-corner-height': cornerHeight() + 'px',
    }`,
  },
})
export class RadianScrollArea {
  dir = input<Direction>();
  scrollHideDelay = input(600, { transform: numberAttribute });

  protected cornerWidth = signal(0);
  protected cornerHeight = signal(0);
  private content = contentChild.required(RadianScrollAreaContent, {
    read: ElementRef,
  });
  private horizontalScrollbar = contentChild(
    RadianScrollAreaHorizontalScrollbar,
    { read: ElementRef },
  );
  private verticalScrollbar = contentChild(RadianScrollAreaVerticalScrollbar, {
    read: ElementRef,
  });
  private scrollbarAutoPresence = contentChild(
    RadianScrollAreaScrollbarAutoPresence,
  );
  private scrollbarHoverPresence = contentChild(
    RadianScrollAreaScrollbarHoverPresence,
  );
  private scrollbarScrollPresence = contentChild(
    RadianScrollAreaScrollbarScrollPresence,
  );
  private viewport = contentChild.required(RadianScrollAreaViewport, {
    read: ElementRef,
  });

  private static contextFactory(): RadianScrollAreaContext {
    const scrollArea = inject(RadianScrollArea);
    const direction = inject(RadianDirection);
    const elementRef = inject(ElementRef);

    return {
      dir: direction.value,
      scrollArea: elementRef,
      content: scrollArea.content,
      cornerHeight: scrollArea.cornerHeight,
      cornerWidth: scrollArea.cornerWidth,
      horizontalScrollbar: scrollArea.horizontalScrollbar,
      scrollHideDelay: scrollArea.scrollHideDelay,
      type: computed(() => {
        if (scrollArea.scrollbarAutoPresence()) {
          return 'auto';
        }

        if (scrollArea.scrollbarHoverPresence()) {
          return 'hover';
        }

        if (scrollArea.scrollbarScrollPresence()) {
          return 'scroll';
        }

        return 'always';
      }),
      verticalScrollbar: scrollArea.verticalScrollbar,
      viewport: scrollArea.viewport,
      horizontalScrollbarEnabled: computed(
        () => !!scrollArea.horizontalScrollbar(),
      ),
      verticalScrollbarEnabled: computed(
        () => !!scrollArea.verticalScrollbar(),
      ),
    };
  }
}

import {
  computed,
  Directive,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RadianScrollAreaContext } from './scroll-area-context';
import { provideRadianPresenceContext } from '@loozo/radian/common';
import { debounceTime, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const stateTransitions = {
  hidden: {
    SCROLL: 'scrolling',
  },
  scrolling: {
    SCROLL_END: 'idle',
    POINTER_ENTER: 'interacting',
  },
  interacting: {
    SCROLL: 'interacting',
    POINTER_LEAVE: 'idle',
  },
  idle: {
    HIDE: 'hidden',
    SCROLL: 'scrolling',
    POINTER_ENTER: 'interacting',
  },
};

type StateTransitions = typeof stateTransitions;

@Directive({
  selector: '[radianScrollAreaScrollbarScrollPresence]',
  providers: [
    provideRadianPresenceContext(() => {
      const scrollAreaScrollbarScrollPresence = inject(
        RadianScrollAreaScrollbarScrollPresence,
      );

      return {
        present: computed(
          () => scrollAreaScrollbarScrollPresence.state() !== 'hidden',
        ),
      };
    }),
  ],
  host: {
    '[attr.data-state]': 'state() !== "hidden" ? "visible" : "hidden"',
    '(pointerenter)': 'transition("POINTER_ENTER")',
    '(pointerleave)': 'transition("POINTER_LEAVE")',
  },
})
export class RadianScrollAreaScrollbarScrollPresence {
  orientation = input.required<'horizontal' | 'vertical'>();
  protected state = signal<keyof StateTransitions>('hidden');

  constructor() {
    const context = inject(RadianScrollAreaContext);

    const scrollEnded = new Subject<void>();

    scrollEnded
      .pipe(debounceTime(100), takeUntilDestroyed())
      .subscribe(() => this.transition('SCROLL_END'));

    effect((onCleanup) => {
      if (this.state() === 'idle') {
        const hideTimer = window.setTimeout(
          () => this.transition('HIDE'),
          context.scrollHideDelay(),
        );

        onCleanup(() => window.clearTimeout(hideTimer));
      }
    });

    effect((onCleanup) => {
      const viewport = context.viewport().nativeElement;
      const scrollDirection =
        this.orientation() === 'horizontal' ? 'scrollLeft' : 'scrollTop';

      if (viewport) {
        let prevScrollPos = viewport[scrollDirection];
        const handleScroll = () => {
          const scrollPos = viewport[scrollDirection];
          const hasScrollInDirectionChanged = prevScrollPos !== scrollPos;
          if (hasScrollInDirectionChanged) {
            this.transition('SCROLL');
            scrollEnded.next();
          }
          prevScrollPos = scrollPos;
        };
        viewport.addEventListener('scroll', handleScroll);

        onCleanup(() => viewport.removeEventListener('scroll', handleScroll));
      }
    });
  }

  private transition(
    event:
      | keyof StateTransitions['hidden']
      | keyof StateTransitions['idle']
      | keyof StateTransitions['interacting']
      | keyof StateTransitions['scrolling'],
  ) {
    this.state.update(
      (v) =>
        (stateTransitions[v] as Record<typeof event, keyof StateTransitions>)[
          event
        ],
    );
  }
}

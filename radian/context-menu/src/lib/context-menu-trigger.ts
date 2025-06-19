import {
  booleanAttribute,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { RadianContextMenuContext } from './context-menu-context';
import { provideRadianPopperAnchor } from '@loozo/radian/popper';
import { EMPTY, filter, fromEvent, race, switchMap, timeout } from 'rxjs';
import { Point } from '@loozo/radian/menu';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Directive({
  selector: '[radianContextMenuTrigger]',
  providers: [
    provideRadianPopperAnchor(() => {
      const contextMenuTrigger = inject(RadianContextMenuTrigger);

      return {
        getBoundingClientRect: computed(() => {
          return DOMRect.fromRect({
            height: 0,
            width: 0,
            ...contextMenuTrigger.pointer(),
          });
        }),
      };
    }),
  ],
  host: {
    '[attr.data-state]': "context.open() ? 'open' : 'closed'",
    '[attr.data-disabled]': "disabled() ? '' : null",
    // prevent iOS context menu from appearing
    '[style]': `{ '-webkit-touch-callout': 'none' }`,
    '(contextmenu)': 'openMenu($event)',
  },
})
export class RadianContextMenuTrigger {
  disabled = input(false, { transform: booleanAttribute });
  protected context = inject(RadianContextMenuContext);

  private pointer = signal<Point>({ x: 0, y: 0 });

  constructor() {
    const elementRef: ElementRef<HTMLElement> = inject(ElementRef);

    touchEvent(elementRef.nativeElement, 'pointerdown')
      .pipe(
        switchMap((event) =>
          race(
            touchEvent(elementRef.nativeElement, 'pointermove'),
            touchEvent(elementRef.nativeElement, 'pointercancel'),
            touchEvent(elementRef.nativeElement, 'pointerup'),
            fromEvent(elementRef.nativeElement, 'contextmenu'),
          ).pipe(
            timeout({
              // Wait 700ms for any of the above events
              each: 700,
              // If no events observed handle long-press
              with: () => {
                this.openMenu(event);

                return EMPTY;
              },
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected openMenu(event: PointerEvent | MouseEvent) {
    if (this.disabled()) {
      return;
    }

    event.preventDefault();

    this.pointer.set({ x: event.clientX, y: event.clientY });
    this.context.setOpen(true);
  }

  protected keyDown(event: KeyboardEvent) {
    if (this.disabled()) {
      return;
    }

    if (['Enter', ' '].includes(event.key)) {
      this.context.toggle();
    }

    if (event.key === 'ArrowDown') {
      this.context.setOpen(true);
    }

    // prevent keydown from scrolling window / first focused item to execute
    // that keydown (inadvertently closing the menu)
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
    }
  }
}

function touchEvent(element: HTMLElement, eventName: string) {
  return fromEvent<PointerEvent>(element, eventName).pipe(
    filter((event) => event.pointerType !== 'mouse'),
  );
}

import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { RadianFocusGroup } from './focus-group';
import { RadianArrowKeys, RadianKey } from '@loozo/radian/common';
import { focusFirst } from './utils';

const navigationKeys = [RadianKey.Home, RadianKey.End, ...RadianArrowKeys];

@Directive({
  host: {
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianFocusGroupItem {
  private focusGroup = inject(RadianFocusGroup);

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    this.focusGroup.itemAdded(elementRef);
    inject(DestroyRef).onDestroy(() => {
      this.focusGroup.itemRemoved(elementRef);
    });
  }

  protected keyDown(event: KeyboardEvent) {
    const isFocusNavigationKey = navigationKeys.includes(event.key);
    if (isFocusNavigationKey) {
      let candidateNodes = this.focusGroup.items();
      const prevItemKey =
        this.focusGroup.dir() === 'rtl'
          ? RadianKey.ArrowRight
          : RadianKey.ArrowLeft;
      const prevKeys = [
        prevItemKey,
        RadianKey.ArrowUp,
        RadianKey.End,
      ] as string[];
      if (prevKeys.includes(event.key)) {
        candidateNodes.reverse();
      }

      if (RadianArrowKeys.includes(event.key)) {
        const currentIndex = candidateNodes.findIndex(
          (n) => n === event.currentTarget,
        );

        candidateNodes = candidateNodes.slice(currentIndex + 1);
      }
      /**
       * Imperative focus during keydown is risky
       */
      setTimeout(() => focusFirst(candidateNodes));

      // Prevent page scroll while navigating
      event.preventDefault();
    }
  }
}

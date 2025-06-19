import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianMenuContent } from '@loozo/radian/menu';
import { RadianMenubarContentContext } from './menubar-content-context';
import { RadianMenubarContext } from './menubar-context';
import { RadianMenubarMenuContext } from './menubar-menu-context';

@Directive({
  selector: '[radianMenubarContent]',
  hostDirectives: [{ directive: RadianMenuContent, inputs: ['loop'] }],
  host: {
    '[attr.aria-labelledby]': 'menuContext.triggerId()',
    // re-namespace exposed content custom properties
    '[style]': `{
      '--radian-menubar-content-transform-origin':
        'var(--radian-popper-transform-origin)',
      '--radian-menubar-content-available-width':
        'var(--radian-popper-available-width)',
      '--radian-menubar-content-available-height':
        'var(--radian-popper-available-height)',
      '--radian-menubar-trigger-width':
        'var(--radian-popper-anchor-width)',
      '--radian-menubar-trigger-height':
        'var(--radian-popper-anchor-height)',
    }`,
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianMenubarContent {
  /**
   * Whether keyboard navigation should loop around
   * @defaultValue false
   */
  loop = input(false, { transform: booleanAttribute });

  private menuContent = inject(RadianMenuContent);
  openAutoFocus = outputFromObservable(
    outputToObservable(this.menuContent.openAutoFocus),
  );
  /**
   * Event handler called when auto-focusing on close.
   * Can be prevented.
   */
  closeAutoFocus = outputFromObservable(
    outputToObservable(this.menuContent.closeAutoFocus),
  );

  protected context = inject(RadianMenubarContext);
  private menuContext = inject(RadianMenubarMenuContext);

  constructor() {
    const contentContext = inject(RadianMenubarContentContext);

    this.menuContent.closeAutoFocus.subscribe((event) => {
      const menubarOpen = Boolean(this.context.value());
      if (!menubarOpen && !contentContext.hasInteractedOutside()) {
        this.menuContext.trigger().nativeElement.focus();
      }

      contentContext.hasInteractedOutside.set(false);
      // Always prevent auto focus because we either focus manually or want user agent focus
      event.preventDefault();
    });

    this.menuContent.entryFocused.subscribe((event) => {
      if (!this.menuContext.wasKeyboardTriggerOpen()) {
        event.preventDefault();
      }
    });
  }

  protected keyDown(event: KeyboardEvent) {
    if (['ArrowRight', 'ArrowLeft'].includes(event.key)) {
      const target = event.target as HTMLElement;
      const targetIsSubTrigger = target.hasAttribute(
        'data-radix-menubar-subtrigger',
      );
      const isKeyDownInsideSubMenu =
        target.closest('[data-radix-menubar-content]') !== event.currentTarget;

      const prevMenuKey =
        this.context.dir() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const isPrevKey = prevMenuKey === event.key;
      const isNextKey = !isPrevKey;

      // Prevent navigation when we're opening a submenu
      if (isNextKey && targetIsSubTrigger) return;
      // or we're inside a submenu and are moving backwards to close it
      if (isKeyDownInsideSubMenu && isPrevKey) return;

      const items = this.context
        .triggers()
        .filter((item) => !item.nativeElement.disabled);
      let candidateValues = items.map(
        (item) => item.nativeElement.dataset['value'],
      );
      if (isPrevKey) candidateValues.reverse();

      const currentIndex = candidateValues.indexOf(this.menuContext.value());

      candidateValues = this.context.loop()
        ? wrapArray(candidateValues, currentIndex + 1)
        : candidateValues.slice(currentIndex + 1);

      const [nextValue] = candidateValues;

      if (nextValue) {
        this.context.openMenu(nextValue);
      }
    }
  }
}
/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */
function wrapArray<T>(array: T[], startIndex: number) {
  return array.map((_, index) => array[(startIndex + index) % array.length]);
}

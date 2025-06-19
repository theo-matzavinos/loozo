import {
  booleanAttribute,
  Directive,
  inject,
  input,
  output,
} from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianMenuContent } from '@loozo/radian/menu';
import { RadianContextMenuContentContext } from './context-menu-content-context';

@Directive({
  selector: '[radianContextMenuContent]',
  hostDirectives: [{ directive: RadianMenuContent, inputs: ['loop'] }],
  host: {
    // re-namespace exposed content custom properties
    '[style]': `{
      '--radian-context-menu-content-transform-origin':
        'var(--radian-popper-transform-origin)',
      '--radian-context-menu-content-available-width':
        'var(--radian-popper-available-width)',
      '--radian-context-menu-content-available-height':
        'var(--radian-popper-available-height)',
      '--radian-context-menu-trigger-width':
        'var(--radian-popper-anchor-width)',
      '--radian-context-menu-trigger-height':
        'var(--radian-popper-anchor-height)',
    }`,
  },
})
export class RadianContextMenuContent {
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
  closeAutoFocus = output<Event>();

  constructor() {
    const contentContext = inject(RadianContextMenuContentContext);

    this.menuContent.closeAutoFocus.subscribe((event) => {
      this.closeAutoFocus.emit(event);

      if (!event.defaultPrevented && contentContext.hasInteractedOutside()) {
        event.preventDefault();
      }

      contentContext.hasInteractedOutside.set(false);
    });
  }
}

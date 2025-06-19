import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianSubMenuContent } from '@loozo/radian/menu';

@Directive({
  selector: '[radianContextSubMenuContent]',
  hostDirectives: [{ directive: RadianSubMenuContent, inputs: ['loop'] }],
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
export class RadianContextSubMenuContent {
  /**
   * Whether keyboard navigation should loop around
   * @defaultValue false
   */
  loop = input(false, { transform: booleanAttribute });

  private menuContent = inject(RadianSubMenuContent);
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
}

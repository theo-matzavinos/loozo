import { booleanAttribute, Directive, inject, input } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianMenuContent } from '@loozo/radian/menu';
import { RadianDropdownMenuContentContext } from './dropdown-menu-content-context';
import { RadianDropdownMenuContext } from './dropdown-menu-context';

@Directive({
  selector: '[radianDropdownMenuContent]',
  hostDirectives: [{ directive: RadianMenuContent, inputs: ['loop'] }],
  host: {
    '[attr.aria-labelledby]': 'context.triggerId()',
    // re-namespace exposed content custom properties
    '[style]': `{
      '--radian-dropdown-menu-content-transform-origin':
        'var(--radian-popper-transform-origin)',
      '--radian-dropdown-menu-content-available-width':
        'var(--radian-popper-available-width)',
      '--radian-dropdown-menu-content-available-height':
        'var(--radian-popper-available-height)',
      '--radian-dropdown-menu-trigger-width':
        'var(--radian-popper-anchor-width)',
      '--radian-dropdown-menu-trigger-height':
        'var(--radian-popper-anchor-height)',
    }`,
  },
})
export class RadianDropdownMenuContent {
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

  protected context = inject(RadianDropdownMenuContext);

  constructor() {
    const contentContext = inject(RadianDropdownMenuContentContext);

    this.menuContent.closeAutoFocus.subscribe((event) => {
      if (!contentContext.hasInteractedOutside()) {
        this.context.trigger().nativeElement.focus();
      }

      contentContext.hasInteractedOutside.set(false);
      // Always prevent auto focus because we either focus manually or want user agent focus
      event.preventDefault();
    });
  }
}

import { Directive, ElementRef, inject } from '@angular/core';
import { RadianVisuallyHidden } from '@loozo/radian/visually-hidden';
import { RadianNavigationMenuItemContext } from './navigation-menu-item-context';

@Directive({
  selector: '[radianFocusProxy]',
  hostDirectives: [RadianVisuallyHidden],
  host: {
    tabindex: '0',
    'aria-hidden': '',
    '(focus)': 'focused($event)',
  },
})
export class RadianFocusProxy {
  private itemContext = inject(RadianNavigationMenuItemContext);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected focused(event: FocusEvent) {
    const content = this.itemContext.content();
    const prevFocusedElement = event.relatedTarget as HTMLElement | null;
    const wasTriggerFocused =
      prevFocusedElement === this.elementRef.nativeElement;
    const wasFocusFromContent =
      content?.nativeElement.contains(prevFocusedElement);

    if (wasTriggerFocused || !wasFocusFromContent) {
      this.itemContext.focusProxyFocused(wasTriggerFocused ? 'start' : 'end');
    }
  }
}

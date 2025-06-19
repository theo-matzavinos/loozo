import {
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { RadianNavigationMenuContext } from './navigation-menu-context';
import { RadianNavigationMenuViewportOutlet } from './navigation-menu-viewport-outlet';
import { elementSize } from '@loozo/radian/common';

@Directive({
  selector: '[radianNavigationMenuViewport]',
  host: {
    '(pointerenter)': 'context.contentHovered()',
    '(pointerleave)':
      '$event.pointerType === "mouse" && context.contentUnhovered()',
  },
})
export class RadianNavigationMenuViewport {
  protected context = inject(RadianNavigationMenuContext);

  private outlet = contentChild.required<
    RadianNavigationMenuViewportOutlet,
    ElementRef<HTMLElement>
  >(RadianNavigationMenuViewportOutlet, { read: ElementRef });
  private injector = inject(Injector);
  private viewportSize = computed(() =>
    elementSize({ elementRef: this.outlet(), injector: this.injector }),
  );

  protected style = computed(() => ({
    // Prevent interaction when animating out
    pointerEvents:
      !this.context.value() && this.context.root ? 'none' : undefined,
    '--radian-navigation-menu-viewport-width': this.viewportSize()().width,
    '--radian-navigation-menu-viewport-height': this.viewportSize()().height,
  }));
}

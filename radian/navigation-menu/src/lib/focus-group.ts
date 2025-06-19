import {
  ElementRef,
  inject,
  InjectionToken,
  Provider,
  signal,
} from '@angular/core';
import { RadianNavigationMenuContext } from './navigation-menu-context';

export type RadianFocusGroup = ReturnType<typeof radianFocusGroupFactory>;

export const RadianFocusGroup = new InjectionToken<RadianFocusGroup>(
  '[Radian] Focus Group',
);

export function provideRadianFocusGroup(): Provider {
  return {
    provide: RadianFocusGroup,
    useFactory: radianFocusGroupFactory,
  };
}
function radianFocusGroupFactory() {
  const context = inject(RadianNavigationMenuContext);
  const items = signal<Array<HTMLElement>>([]);

  return {
    dir: context.dir,
    items: items.asReadonly(),
    itemAdded(item: ElementRef<HTMLElement>) {
      items.update((v) => [...v, item.nativeElement]);
    },
    itemRemoved(item: ElementRef<HTMLElement>) {
      items.update((v) => v.filter((i) => i !== item.nativeElement));
    },
  };
}

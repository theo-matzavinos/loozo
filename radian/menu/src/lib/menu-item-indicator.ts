import {
  computed,
  Directive,
  inject,
  InjectionToken,
  Provider,
  Signal,
} from '@angular/core';

export type RadianMenuItemCheckedState = boolean | 'indeterminate';

export type RadianMenuItemIndicatorContext = {
  checked: Signal<RadianMenuItemCheckedState>;
};

export const RadianMenuItemIndicatorContext =
  new InjectionToken<RadianMenuItemIndicatorContext>(
    '[Radian] Menu Item Indicator Context',
  );

export function provideRadianMenuItemIndicatorContext(
  factory: () => RadianMenuItemIndicatorContext,
): Provider {
  return { provide: RadianMenuItemIndicatorContext, useFactory: factory };
}

@Directive({
  selector: '[radianMenuItemIndicator]',
  host: {
    '[attr.data-state]': 'state()',
  },
})
export class RadianMenuItemIndicator {
  protected context = inject(RadianMenuItemIndicatorContext);
  protected state = computed(() => {
    const checked = this.context.checked();

    if (checked === 'indeterminate') {
      return checked;
    }

    return checked ? 'checked' : 'unchecked';
  });
}

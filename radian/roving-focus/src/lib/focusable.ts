import {
  booleanAttribute,
  computed,
  Directive,
  ElementRef,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  Provider,
  Signal,
} from '@angular/core';
import { RadianRovingFocusGroupContext } from './roving-focus-group-context';

export type RadianFocusableContext = {
  value: Signal<string>;
};

export const RadianFocusableContext =
  new InjectionToken<RadianFocusableContext>('[Radian] Focusable Context');

export function provideRadianFocusableContext(
  factory: () => RadianFocusableContext,
): Provider {
  return { provide: RadianFocusableContext, useFactory: factory };
}

@Directive({
  host: {
    'data-radian-focusable': '',
    '[attr.tabindex]': 'tabIndex()',
    '[attr.data-orientation]': 'context.orientation()',
    '[attr.data-active]': 'active() ? "" : null',
    '[attr.data-disabled]': 'computedDisabled() ? "" : null',
    '(mousedown)': 'mouseDown($event)',
    '(focus)': 'focused($event)',
  },
})
export class RadianFocusable {
  protected context = inject(RadianRovingFocusGroupContext);
  value = inject(RadianFocusableContext).value;
  /** Whether this item is not focusable. */
  disabled = input(false, { transform: booleanAttribute });

  /** Whether this item is currently focused. */
  active = computed(() => this.context.active() === this.value());

  /** @internal */
  elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected tabIndex = computed(() => (this.active() ? '0' : '-1'));

  private _computedDisabled = linkedSignal(this.disabled);

  /** Whether this item is not focusable. */
  computedDisabled = this._computedDisabled.asReadonly();

  protected mouseDown(event: MouseEvent) {
    if (this.disabled()) {
      event.preventDefault();
    }

    this.context.onItemFocused(event, this.value());
  }

  protected focused(event: FocusEvent) {
    this.context.onItemFocused(event, this.value());
  }

  /** @internal */
  enable() {
    this._computedDisabled.set(false);
  }

  /** @internal */
  disable() {
    this._computedDisabled.set(true);
  }
}

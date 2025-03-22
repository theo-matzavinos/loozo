import {
  booleanAttribute,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianRovingFocusGroup } from './roving-focus-group';

@Directive({
  host: {
    'data-radian-focusable': '',
    '[attr.tabindex]': 'tabIndex()',
    '[attr.data-orientation]': 'rovingFocusGroup.orientation()',
    '[attr.data-active]': 'active() ? "" : null',
    '[attr.data-disabled]': 'computedDisabled() ? "" : null',
    '(mousedown)': 'mouseDown($event)',
    '(focus)': 'focused($event)',
  },
})
export class RadianFocusable {
  /**
   * A unique value that identifies this item in the group.
   * Will be auto-generated if not provided.
   * */
  value = input<string>(uniqueId('radian-focusable'));
  /** Whether this item is not focusable. */
  disabled = input(false, { transform: booleanAttribute });

  /** Whether this item is currently focused. */
  active = computed(() => this.rovingFocusGroup.active() === this.value());

  protected rovingFocusGroup = inject(RadianRovingFocusGroup, { host: true });

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

    this.rovingFocusGroup.onItemFocused(this.value());
  }

  protected focused() {
    this.rovingFocusGroup.onItemFocused(this.value());
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

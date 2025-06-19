import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { RadianSelectItemContext } from './select-item-context';
import { uniqueId } from '@loozo/radian/common';
import { RadianSelectContext } from './select-context';
import { RadianSelectItemText } from './select-item-text';
import { RadianSelectContentContext } from './select-content-context';

const SELECTION_KEYS = [' ', 'Enter'];

@Directive({
  selector: '[radianSelectItem]',
  providers: [
    {
      provide: RadianSelectItemContext,
      useFactory: RadianSelectItem.contextFactory,
    },
  ],
  host: {
    role: 'option',
    '[attr.aria-labelledby]': 'textId',
    '[attr.data-highlighted]': 'isFocused() ? "" : null',
    // `isFocused` caveat fixes stuttering in VoiceOver
    '[attr.aria-selected]': 'isSelected() && isFocused()',
    '[attr.data-state]': "isSelected() ? 'checked' : 'unchecked'",
    '[attr.aria-disabled]': 'disabled() || null',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[tabIndex]': 'disabled() ? undefined : -1',
    '(focus)': 'isFocused.set(true)',
    '(blur)': 'isFocused.set(false)',
    '(pointerdown)': 'lastPointerType = event.pointerType',
    // Using a mouse you should be able to do pointer down, move through
    // the list, and release the pointer over the item to select it.
    '(pointerup)': 'lastPointerType === "mouse" && select()',
    // Select on click when using a touch or pen device
    '(click)': 'lastPointerType !== "mouse" && select()',
    '(pointermove)': 'pointerMoved($event)',
    '(pointerleave)': 'unhovered($event)',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianSelectItem {
  value = input.required<string>();
  disabled = input(false, { transform: booleanAttribute });
  textValue = input<string>();

  /** @internal */
  textElement = contentChild.required(RadianSelectItemText, {
    read: ElementRef,
  });
  protected textId = uniqueId('radian-select-item-text');
  private context = inject(RadianSelectContext);
  private contentContext = inject(RadianSelectContentContext);
  protected isSelected = computed(() => {
    if (this.context.multiple) {
      return !!this.context.value()?.includes(this.value());
    }

    return this.context.value() === this.value();
  });
  protected isFocused = signal(false);
  protected lastPointerType?: string;

  protected select() {
    if (this.context.multiple) {
      this.context.add(this.value());
    } else {
      this.context.setValue(this.value());
    }
  }

  protected pointerMoved(event: PointerEvent) {
    // Remember pointer type when sliding over to this item from another one
    this.lastPointerType = event.pointerType;

    if (this.disabled()) {
      this.contentContext.itemUnhovered();
    } else if (this.lastPointerType === 'mouse') {
      // even though safari doesn't support this option, it's acceptable
      // as it only means it might scroll a few pixels when using the pointer.
      (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    }
  }

  protected unhovered(event: PointerEvent) {
    if (event.currentTarget === document.activeElement) {
      this.contentContext.itemUnhovered();
    }
  }

  protected keyDown(event: KeyboardEvent) {
    const isTypingAhead = this.contentContext.search() !== '';
    if (isTypingAhead && event.key === ' ') return;
    if (SELECTION_KEYS.includes(event.key)) {
      this.select();
    }
    // prevent page scroll if using the space key to select an item
    if (event.key === ' ') {
      event.preventDefault();
    }
  }

  private static contextFactory(): RadianSelectItemContext {
    const selectItem = inject(RadianSelectItem);

    return {
      disabled: selectItem.disabled,
      isSelected: selectItem.isSelected,
      textId: selectItem.textId,
      value: selectItem.value,
    };
  }
}

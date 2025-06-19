import {
  booleanAttribute,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { RadianFocusGroupItem } from './focus-group-item';
import { RadianNavigationMenuItemContext } from './navigation-menu-item-context';
import { RadianNavigationMenuContext } from './navigation-menu-context';
import { RadianKey, uniqueId } from '@loozo/radian/common';

@Directive({
  selector: '[radianNavigationMenuTrigger]',
  hostDirectives: [RadianFocusGroupItem],
  host: {
    '[attr.id]': 'itemContext.triggerId()',
    '[attr.disabled]': 'disabled()',
    '[attr.data-disabled]': 'disabled() || null',
    '[attr.data-state]': 'state()',
    '[attr.aria-expanded]': 'open()',
    '[attr.aria-controls]': 'itemContext.contentId()',
    '(pointerenter)': 'hovered()',
    '(pointermove)': 'pointerMoved($event)',
    '(pointerleave)': 'unhovered($event)',
    '(click)': 'clicked()',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianNavigationMenuTrigger {
  value = input(uniqueId('radian-navigation-menu-trigger'));
  disabled = input(false, { transform: booleanAttribute });

  private context = inject(RadianNavigationMenuContext);
  private itemContext = inject(RadianNavigationMenuItemContext);
  private hasPointerMoveOpened = signal(false);
  private wasClickClose = signal(false);
  protected open = computed(
    () => this.itemContext.value() === this.context.value(),
  );

  constructor() {
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    this.context.triggerAdded(this.value, elementRef);

    inject(DestroyRef).onDestroy(() => {
      this.context.triggerRemoved(elementRef);
    });
  }

  protected hovered() {
    this.wasClickClose.set(false);
    this.itemContext.wasEscapeClose.set(false);
  }

  protected pointerMoved(event: PointerEvent) {
    if (
      event.pointerType !== 'mouse' ||
      this.disabled() ||
      this.wasClickClose() ||
      this.itemContext.wasEscapeClose() ||
      this.hasPointerMoveOpened()
    ) {
      return;
    }
    this.context.triggerHovered(this.itemContext.value());
    this.hasPointerMoveOpened.set(true);
  }

  protected unhovered(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || this.disabled()) {
      return;
    }
    this.context.triggerUnhovered();
    this.hasPointerMoveOpened.set(false);
  }

  protected clicked() {
    const wasOpen = this.open();

    this.context.itemSelected(this.itemContext.value());
    this.wasClickClose.set(wasOpen);
  }

  protected keyDown(event: KeyboardEvent) {
    const verticalEntryKey: string =
      this.context.dir() === 'rtl' ? RadianKey.ArrowLeft : RadianKey.ArrowRight;
    const entryKey = {
      horizontal: RadianKey.ArrowDown,
      vertical: verticalEntryKey,
    }[this.context.orientation()];

    if (this.open() && event.key === entryKey) {
      this.itemContext.entryKeyDown();
      // Prevent FocusGroupItem from handling the event
      event.preventDefault();
    }
  }
}

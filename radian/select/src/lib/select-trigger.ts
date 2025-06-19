import {
  booleanAttribute,
  computed,
  Directive,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RadianPopperElementAnchor } from '@loozo/radian/popper';
import { findNextItem, RadianTypeahead } from './typeahead';
import { RadianSelectContext } from './select-context';

const OPEN_KEYS = [' ', 'Enter', 'ArrowUp', 'ArrowDown'];

@Directive({
  selector: '[radianSelectTrigger]',
  hostDirectives: [RadianPopperElementAnchor],
  host: {
    type: 'button',
    role: 'combobox',
    'aria-autocomplete': 'none',
    '[attr.aria-controls]': 'context.contentId',
    '[attr.aria-expanded]': 'context.open()',
    '[attr.aria-required]': 'context.required()',
    '[dir]': 'context.dir()',
    '[attr.data-state]': "context.open() ? 'open' : 'closed'",
    '[disabled]': 'isDisabled()',
    '[attr.data-disabled]': "isDisabled() ? '' : undefined",
    '[attr.data-placeholder]': "shouldShowPlaceholder() ? '' : undefined",
    '(click)': 'clicked($event)',
    '(pointerdown)': 'pointerDown($event)',
    '(keydown)': 'keyDown($event)',
  },
})
export class RadianSelectTrigger {
  disabled = input(false, { transform: booleanAttribute });

  private pointerType = signal<string>('');
  private typeahead = inject(RadianTypeahead);
  private context = inject(RadianSelectContext);
  protected isDisabled = computed(
    () => this.context.disabled() || this.disabled(),
  );
  protected shouldShowPlaceholder = computed(() => {
    if (this.context.multiple) {
      return !this.context.value()?.length;
    } else {
      return this.context.value() === '' || this.context.value() === undefined;
    }
  });

  constructor() {
    if (this.context.multiple) {
      return;
    }

    effect(() => {
      const enabledItems = this.context
        .options()
        .filter((item) => !item.disabled());
      const currentItem = enabledItems.find(
        (item) => item.value() === this.context.value(),
      );
      const nextItem = findNextItem(
        enabledItems,
        this.typeahead.value(),
        currentItem,
      );

      if (!nextItem) {
        return;
      }

      this.context.setValue(nextItem.value() as never);
    });
  }

  protected clicked(event: MouseEvent) {
    // Whilst browsers generally have no issue focusing the trigger when clicking
    // on a label, Safari seems to struggle with the fact that there's no `onClick`.
    // We force `focus` in this case. Note: this doesn't create any other side-effect
    // because we are preventing default in `onPointerDown` so effectively
    // this only runs for a label "click"
    (event.currentTarget as HTMLElement).focus();

    // Open on click when using a touch or pen device
    if (this.pointerType() !== 'mouse') {
      this.handleOpen(event);
    }
  }

  protected pointerDown(event: PointerEvent) {
    this.pointerType.set(event.pointerType);

    // prevent implicit pointer capture
    // https://www.w3.org/TR/pointerevents3/#implicit-pointer-capture
    const target = event.target as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
    // but not when the control key is pressed (avoiding MacOS right click); also not for touch
    // devices because that would open the menu on scroll. (pen devices behave as touch on iOS).
    if (
      event.button === 0 &&
      event.ctrlKey === false &&
      event.pointerType === 'mouse'
    ) {
      this.handleOpen(event);
      // prevent trigger from stealing focus from the active item after opening.
      event.preventDefault();
    }
  }

  protected keyDown(event: KeyboardEvent) {
    const isTypingAhead = this.typeahead.value() !== '';
    const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;

    if (!isModifierKey && event.key.length === 1) {
      this.typeahead.search(event.key);
    }

    if (isTypingAhead && event.key === ' ') {
      return;
    }

    if (OPEN_KEYS.includes(event.key)) {
      this.handleOpen();
      event.preventDefault();
    }
  }

  private handleOpen(event?: MouseEvent | PointerEvent) {
    if (this.disabled()) {
      return;
    }

    this.context.setOpen(true);
    // reset typeahead when we open
    this.typeahead.reset();

    if (!event) {
      return;
    }

    this.context.triggerPointerDownPos.set({
      x: Math.round(event.pageX),
      y: Math.round(event.pageY),
    });
  }
}

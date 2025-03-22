import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianPopper } from '@loozo/radian/popper';
import { RadianPopoverTrigger } from './popover-trigger';

export type RadianPopoverContext = ReturnType<
  (typeof RadianPopover)['contextFactory']
>;

export const RadianPopoverContext = new InjectionToken<RadianPopoverContext>(
  '[Radian] Popover Context',
);

@Directive({
  selector: '[radianPopover]',
  exportAs: 'radianPopover',
  standalone: true,
  providers: [
    { provide: RadianPopoverContext, useFactory: RadianPopover.contextFactory },
  ],
  hostDirectives: [RadianPopper],
})
export class RadianPopover {
  /** Used to create ids for the children elements. */
  id = input(uniqueId('radian-popover'));
  /** Controls whether the popover's content is visible. */
  open = input(false, { transform: booleanAttribute });
  /**
   * The modality of the popover.
   * When set to `true`, interaction with outside elements will be disabled and only popover content will be visible to screen readers.
   * */
  modal = input(false, { transform: booleanAttribute });

  /** Emits when the popover opens or closes. */
  openChange = output<boolean>();
  private isOpen = linkedSignal(this.open);
  private trigger = contentChild.required(RadianPopoverTrigger);

  /** Toggles the open state of the popover. */
  toggle() {
    this.setOpen(!this.isOpen());
  }

  /** Sets the open state of the popover. */
  setOpen(open: boolean) {
    this.isOpen.set(open);
    this.openChange.emit(open);
  }

  private static contextFactory() {
    const popover = inject(RadianPopover);

    return {
      contentId: computed(() => `${popover.id()}-content`),
      modal: popover.modal,
      open: popover.isOpen.asReadonly(),
      trigger: popover.trigger,
      setOpen(open: boolean) {
        popover.setOpen(open);
      },
      toggle() {
        popover.toggle();
      },
    };
  }
}

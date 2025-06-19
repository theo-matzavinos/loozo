import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  InjectionToken,
  input,
  linkedSignal,
  output,
  Provider,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianDialogContent } from './dialog-content';
import { RadianDialogTrigger } from './dialog-trigger';
import { RadianDialogContext } from './dialog-context';

export type RadianDialogDefaults = {
  modal?: boolean;
};

export const RadianDialogDefaults = new InjectionToken<RadianDialogDefaults>(
  '[Radian] Dialog Defaults',
  {
    factory() {
      return {
        modal: false,
      };
    },
  },
);

export function provideRadianDialogDefaults(
  value: RadianDialogDefaults,
): Provider {
  return { provide: RadianDialogDefaults, useValue: value };
}

@Directive({
  selector: '[radianDialog]',
  providers: [
    { provide: RadianDialogContext, useFactory: RadianDialog.contextFactory },
  ],
})
export class RadianDialog {
  /** Used to create ids for the children elements. */
  id = input(uniqueId('radian-dialog'));
  /** Controls whether the popover's content is visible. */
  open = input(false, { transform: booleanAttribute });
  /**
   * The modality of the dialog.
   * When set to `true`, interaction with outside elements will be disabled and only popover content will be visible to screen readers.
   * */
  modal = input(!!inject(RadianDialogDefaults).modal, {
    transform: booleanAttribute,
  });

  /** Emits when the dialog opens or closes. */
  openChange = output<boolean>();

  private isOpen = linkedSignal(this.open);
  private trigger = contentChild<
    RadianDialogTrigger,
    ElementRef<HTMLButtonElement>
  >(RadianDialogTrigger, { read: ElementRef });
  private content = contentChild.required<
    RadianDialogContent,
    ElementRef<HTMLElement>
  >(RadianDialogContent, { descendants: true, read: ElementRef });

  /** Toggles the open state of the dialog. */
  toggle() {
    this.setOpen(!this.isOpen());
  }

  /** Sets the open state of the dialog. */
  setOpen(open: boolean) {
    this.isOpen.set(open);
    this.openChange.emit(open);
  }

  private static contextFactory(): RadianDialogContext {
    const dialog = inject(RadianDialog);

    return {
      trigger: dialog.trigger,
      content: dialog.content,
      contentId: computed(() => `${dialog.id()}-content`),
      titleId: computed(() => `${dialog.id()}-title`),
      descriptionId: computed(() => `${dialog.id()}-description`),
      open: dialog.isOpen.asReadonly(),
      setOpen(open: boolean) {
        dialog.setOpen(open);
      },
      toggle() {
        dialog.toggle();
      },
      modal: dialog.modal,
      state: computed(() => (dialog.open() ? 'open' : 'closed')),
    };
  }
}

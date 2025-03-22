import {
  booleanAttribute,
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  InjectionToken,
  input,
  model,
  Provider,
} from '@angular/core';
import { uniqueId } from '@loozo/radian/common';
import { RadianDialogContent } from './dialog-content';
import { RadianDialogTrigger } from './dialog-trigger';

export type RadianDialogContext = ReturnType<
  (typeof RadianDialog)['contextFactory']
>;

export const RadianDialogContext = new InjectionToken<RadianDialogContext>(
  '[Radian] Dialog Context',
);

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
  open = model(false);
  modal = input(!!inject(RadianDialogDefaults).modal, {
    transform: booleanAttribute,
  });

  private trigger = contentChild<
    RadianDialogTrigger,
    ElementRef<HTMLButtonElement>
  >(RadianDialogTrigger, { read: ElementRef });
  private content = contentChild.required<
    RadianDialogContent,
    ElementRef<HTMLElement>
  >(RadianDialogContent, { descendants: true, read: ElementRef });

  private static contextFactory() {
    const id = uniqueId('radian-dialog');
    const dialog = inject(RadianDialog);

    return {
      trigger: dialog.trigger,
      content: dialog.content,
      contentId: `${id}-content`,
      titleId: `${id}-title`,
      descriptionId: `${id}-description`,
      open: dialog.open.asReadonly(),
      setOpen(open: boolean) {
        dialog.open.set(open);
      },
      toggle() {
        dialog.open.update((v) => !v);
      },
      modal: dialog.modal,
      state: computed(() => (dialog.open() ? 'open' : 'closed')),
    };
  }
}

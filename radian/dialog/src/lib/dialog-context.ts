import { ElementRef, InjectionToken, Signal } from '@angular/core';

export type RadianDialogContext = {
  trigger: Signal<ElementRef<HTMLButtonElement> | undefined>;
  content: Signal<ElementRef<HTMLElement>>;
  contentId: Signal<string>;
  titleId: Signal<string>;
  descriptionId: Signal<string>;
  open: Signal<boolean>;
  setOpen(open: boolean): void;
  toggle(): void;
  modal: Signal<boolean>;
  state: Signal<'open' | 'closed'>;
};

export const RadianDialogContext = new InjectionToken<RadianDialogContext>(
  '[Radian] Dialog Context',
);

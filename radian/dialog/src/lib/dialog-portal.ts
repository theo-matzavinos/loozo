import {
  Directive,
  ElementRef,
  inject,
  InjectionToken,
  input,
} from '@angular/core';
import { RadianPortal } from '@loozo/radian/portal';
import { RadianDialogContext } from './dialog-context';

export type RadianDialogRef = {
  close(): void;
};

export const RadianDialogRef = new InjectionToken<RadianDialogRef>(
  '[Radian] Dialog Ref',
);

@Directive({
  selector: '[radianDialogPortal]',
  providers: [
    {
      provide: RadianDialogRef,
      useFactory() {
        const context = inject(RadianDialogContext);

        return {
          close() {
            context.setOpen(false);
          },
        };
      },
    },
  ],
  hostDirectives: [{ directive: RadianPortal, inputs: ['container'] }],
})
export class RadianDialogPortal {
  /**
   * Specify a container element to portal the content into.
   */
  container = input<ElementRef<HTMLElement> | HTMLElement>();
}

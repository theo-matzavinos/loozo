import { contentChild, Directive, ElementRef, inject } from '@angular/core';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianDialogContent } from '@loozo/radian/dialog';
import { RadianAlertDialogCancel } from './alert-dialog-cancel';

@Directive({
  selector: '[radianAlertDialogContent]',
  hostDirectives: [RadianDialogContent],
  host: {
    role: 'alertdialog',
  },
})
export class RadianAlertDialogContent {
  private dialogContent = inject(RadianDialogContent);
  /**
   * Event handler called when auto-focusing on mount.
   * Can be prevented.
   */
  mountAutoFocus = outputFromObservable(
    outputToObservable(this.dialogContent.mountAutoFocus),
  );

  /**
   * Event handler called when auto-focusing on unmount.
   * Can be prevented.
   */
  unmountAutoFocus = outputFromObservable(
    outputToObservable(this.dialogContent.unmountAutoFocus),
  );
  /**
   * Event handler called when the escape key is down.
   * Can be prevented.
   */
  escapeKeyDown = outputFromObservable(
    outputToObservable(this.dialogContent.escapeKeyDown),
  );
  /**
   * Emits when a `pointerdown` event happens outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  pointerDownOutside = outputFromObservable(
    outputToObservable(this.dialogContent.pointerDownOutside),
  );
  /**
   * Emits when the focus moves outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  focusOutside = outputFromObservable(
    outputToObservable(this.dialogContent.focusOutside),
  );
  /**
   * Emits when an interaction happens outside the `RadianDismissibleLayer`.
   * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
   * Can be prevented.
   */
  interactionOutside = outputFromObservable(
    outputToObservable(this.dialogContent.interactionOutside),
  );

  private cancel = contentChild<
    RadianAlertDialogCancel,
    ElementRef<HTMLButtonElement>
  >(RadianAlertDialogCancel, { read: ElementRef });

  constructor() {
    const dialogContent = inject(RadianDialogContent);

    dialogContent.mountAutoFocus.subscribe((event) => {
      event.preventDefault();
      this.cancel()?.nativeElement.focus({ preventScroll: true });
    });
    dialogContent.pointerDownOutside.subscribe((e) => e.preventDefault());
    dialogContent.interactionOutside.subscribe((e) => e.preventDefault());
  }
}

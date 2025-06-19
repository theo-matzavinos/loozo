import {
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';
import {
  RadianToasterSwipeDirection,
  RadianToastsProviderContext,
} from './toasts-provider-context';
import { RadianToastsList } from './toasts-list';

@Directive({
  selector: '[radianToastsProvider]',
  providers: [
    {
      provide: RadianToastsProviderContext,
      useFactory: RadianToastsProvider.contextFactory,
    },
  ],
})
export class RadianToastsProvider {
  /**
   * An author-localized label for each toast. Used to help screen reader users
   * associate the interruption with a toast.
   * @defaultValue 'Notification'
   */
  label = input('Notification');
  /**
   * Time in milliseconds that each toast should remain visible for.
   * @defaultValue 5000
   */
  duration = input(5000, { transform: numberAttribute });
  /**
   * Direction of pointer swipe that should close the toast.
   * @defaultValue 'right'
   */
  swipeDirection = input<RadianToasterSwipeDirection>('right');
  /**
   * Distance in pixels that the swipe must pass before a close is triggered.
   * @defaultValue 50
   */
  swipeThreshold = input(50, { transform: numberAttribute });

  private list = contentChild.required(RadianToastsList, { read: ElementRef });

  private static contextFactory(): RadianToastsProviderContext {
    const provider = inject(RadianToastsProvider);
    const toastsCount = signal(0);

    return {
      duration: provider.duration,
      isClosePaused: signal(false),
      isFocusedToastEscapeKeyDown: signal(false),
      label: provider.label,
      list: provider.list,
      swipeDirection: provider.swipeDirection,
      swipeThreshold: provider.swipeThreshold,
      toastsCount: toastsCount.asReadonly(),
      toastAdded() {
        toastsCount.update((v) => v + 1);
      },
      toastRemoved() {
        toastsCount.update((v) => v - 1);
      },
    };
  }
}

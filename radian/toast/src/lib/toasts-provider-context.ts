import {
  ElementRef,
  InjectionToken,
  Signal,
  WritableSignal,
} from '@angular/core';

export type RadianToasterSwipeDirection = 'up' | 'down' | 'left' | 'right';

export type RadianToastsProviderContext = {
  label: Signal<string>;
  duration: Signal<number>;
  swipeDirection: Signal<RadianToasterSwipeDirection>;
  swipeThreshold: Signal<number>;
  list: Signal<ElementRef<HTMLElement>>;
  isFocusedToastEscapeKeyDown: WritableSignal<boolean>;
  isClosePaused: WritableSignal<boolean>;
  toastsCount: Signal<number>;
  toastAdded(): void;
  toastRemoved(): void;
};

export const RadianToastsProviderContext =
  new InjectionToken<RadianToastsProviderContext>(
    '[Radian] Toasts Provider Context',
  );

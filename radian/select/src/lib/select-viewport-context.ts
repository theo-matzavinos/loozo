import { ElementRef, InjectionToken, Signal } from '@angular/core';

export type RadianSelectViewportContext = {
  contentWrapper: ElementRef<HTMLElement>;
  shouldExpandOnScroll: Signal<boolean>;
  scrollButtonAdded(): void;
};

export const RadianSelectViewportContext =
  new InjectionToken<RadianSelectViewportContext>(
    '[Radian] Select Viewport Context',
  );

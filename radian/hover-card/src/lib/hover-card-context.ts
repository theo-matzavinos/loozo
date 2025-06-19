import { Signal, InjectionToken, WritableSignal } from '@angular/core';

export type RadianHoverCardContext = {
  isOpen: Signal<boolean>;
  open(): void;
  close(): void;
  dismiss(): void;
  hasSelection: WritableSignal<boolean>;
  isPointerDownOnContent: WritableSignal<boolean>;
};

export const RadianHoverCardContext =
  new InjectionToken<RadianHoverCardContext>('[Radian] Hover Card Context');

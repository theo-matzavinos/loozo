import { Signal, InjectionToken } from '@angular/core';

export type RadianCollapsibleContext = {
  open: Signal<boolean>;
  disabled: Signal<boolean>;
  contentId: Signal<string>;
  state: Signal<'open' | 'closed'>;
  toggle(): void;
  enable(): void;
  disable(): void;
};

export const RadianCollapsibleContext =
  new InjectionToken<RadianCollapsibleContext>('[Radian] Collapsible Context');

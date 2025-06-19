import { WritableSignal, InjectionToken } from '@angular/core';

export type RadianSubMenuContext = {
  contentId: string;
  triggerId: string;
  trigger: WritableSignal<HTMLButtonElement | undefined>;
};

export const RadianSubMenuContext = new InjectionToken<RadianSubMenuContext>(
  '[Radian] Sub Menu Context',
);

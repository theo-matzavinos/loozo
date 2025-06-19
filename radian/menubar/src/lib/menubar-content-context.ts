import { InjectionToken, WritableSignal } from '@angular/core';

export type RadianMenubarContentContext = {
  hasInteractedOutside: WritableSignal<boolean>;
};

export const RadianMenubarContentContext =
  new InjectionToken<RadianMenubarContentContext>(
    '[Radian] Menubar Content Context',
  );

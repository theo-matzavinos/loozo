import { InjectionToken, WritableSignal } from '@angular/core';

export type RadianContextMenuContentContext = {
  hasInteractedOutside: WritableSignal<boolean>;
};

export const RadianContextMenuContentContext =
  new InjectionToken<RadianContextMenuContentContext>(
    '[Radian] Context Menu Content Context',
  );

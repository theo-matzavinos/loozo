import { InjectionToken, WritableSignal } from '@angular/core';

export type RadianDropdownMenuContentContext = {
  hasInteractedOutside: WritableSignal<boolean>;
};

export const RadianDropdownMenuContentContext =
  new InjectionToken<RadianDropdownMenuContentContext>(
    '[Radian] Dropdown Menu Content Context',
  );

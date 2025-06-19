import { InjectionToken, ResourceRef } from '@angular/core';

export type RadianAvatarContext = {
  resource: ResourceRef<void>;
};

export const RadianAvatarContext = new InjectionToken<RadianAvatarContext>(
  '[Radian] Avatar Context',
);

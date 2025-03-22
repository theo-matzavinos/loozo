import {
  contentChild,
  Directive,
  inject,
  InjectionToken,
  resource,
  ResourceRef,
} from '@angular/core';
import { RadianAvatarImage } from './avatar-image';

export const RadianAvatarImageResource = new InjectionToken<ResourceRef<void>>(
  '[Radian] Avatar Image',
);

@Directive({
  selector: '[radianAvatar]',
  providers: [
    {
      provide: RadianAvatarImageResource,
      useFactory(): ResourceRef<void> {
        const avatar = inject(RadianAvatar);

        return resource<
          void,
          { src: string; referrerPolicy?: string; crossOrigin?: string }
        >({
          request: () => {
            const { crossOrigin, referrerPolicy, src } = avatar.image();

            return {
              crossOrigin: crossOrigin(),
              referrerPolicy: referrerPolicy(),
              src: src(),
            };
          },
          loader: (params) =>
            new Promise((resolve, reject) => {
              if (!params.request.src) {
                reject('error');

                return;
              }

              const image = new window.Image();

              if (params.request.referrerPolicy) {
                image.referrerPolicy = params.request.referrerPolicy;
              }

              if (typeof params.request.crossOrigin === 'string') {
                image.crossOrigin = params.request.crossOrigin;
              }

              image.onload = () => resolve();
              image.onerror = () => reject('error');
              image.src = params.request.src;
            }),
        });
      },
    },
  ],
  host: {
    'data-radian-avatar': '',
  },
})
export class RadianAvatar {
  protected image = contentChild.required(RadianAvatarImage);
}

import { contentChild, Directive, inject, resource } from '@angular/core';
import { RadianAvatarImage } from './avatar-image';
import { RadianAvatarContext } from './avatar-context';

@Directive({
  selector: '[radianAvatar]',
  providers: [
    {
      provide: RadianAvatarContext,
      useFactory: RadianAvatar.contextFactory,
    },
  ],
})
export class RadianAvatar {
  protected image = contentChild.required(RadianAvatarImage);

  private static contextFactory(): RadianAvatarContext {
    const avatar = inject(RadianAvatar);

    return {
      resource: resource<
        void,
        { src: string; referrerPolicy?: string; crossOrigin?: string }
      >({
        params: () => {
          const { crossOrigin, referrerPolicy, src } = avatar.image();

          return {
            crossOrigin: crossOrigin(),
            referrerPolicy: referrerPolicy(),
            src: src(),
          };
        },
        loader: (params) =>
          new Promise((resolve, reject) => {
            if (!params.params.src) {
              reject('error');

              return;
            }

            const image = new window.Image();

            if (params.params.referrerPolicy) {
              image.referrerPolicy = params.params.referrerPolicy;
            }

            if (typeof params.params.crossOrigin === 'string') {
              image.crossOrigin = params.params.crossOrigin;
            }

            image.onload = () => resolve();
            image.onerror = () => reject('error');
            image.src = params.params.src;
          }),
      }),
    };
  }
}

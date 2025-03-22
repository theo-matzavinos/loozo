import {
  computed,
  Directive,
  effect,
  inject,
  input,
  numberAttribute,
  resource,
  ResourceStatus,
  untracked,
} from '@angular/core';
import {
  provideRadianPresenceContext,
  RadianPresence,
} from '@loozo/radian/common';
import { RadianAvatarImageResource } from './avatar';

@Directive({
  selector: '[radianAvatarFallback]',
  providers: [
    provideRadianPresenceContext(() => {
      const avatarFallback = inject(RadianAvatarFallback);
      const avatarImageResource = inject(RadianAvatarImageResource);
      const isResolved = computed(
        () => avatarImageResource.status() === ResourceStatus.Resolved,
      );
      const delayResource = resource({
        loader: (params) =>
          new Promise((resolve) => {
            const timeout = setTimeout(resolve, avatarFallback.delayMs());

            params.abortSignal.onabort = () => clearTimeout(timeout);
          }),
      });

      effect(() => {
        if (!isResolved()) {
          untracked(() => delayResource.reload());
        }
      });

      return {
        present: computed(() => {
          if (isResolved()) {
            return false;
          }

          if (avatarFallback.delayMs() === 0) {
            return true;
          }

          return delayResource.status() === ResourceStatus.Resolved;
        }),
      };
    }),
  ],
  hostDirectives: [RadianPresence],
})
export class RadianAvatarFallback {
  /** Useful for delaying rendering so it only appears for those with slower connections. */
  delayMs = input(0, {
    transform: numberAttribute,
    alias: 'radianAvatarFallback',
  });
}

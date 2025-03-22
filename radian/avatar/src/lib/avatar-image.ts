import {
  computed,
  Directive,
  inject,
  input,
  ResourceStatus,
} from '@angular/core';
import { RadianAvatarImageResource } from './avatar';

@Directive({
  selector: 'img[radianAvatarImage]',
  exportAs: 'radianAvatarImage',
  host: {
    'data-radian-avatar-image': '',
    '[src]': 'src()',
    '[attr.referrerpolicy]': 'referrerPolicy() ?? null',
    '[crossOrigin]': 'crossOrigin()',
    '[hidden]': 'hidden()',
  },
})
export class RadianAvatarImage {
  /** @internal */
  src = input.required<string>();
  /** @internal */
  referrerPolicy = input<string>();
  /** @internal */
  crossOrigin = input<string>();

  private avatarImageResource = inject(RadianAvatarImageResource);
  protected hidden = computed(
    () => this.avatarImageResource.status() !== ResourceStatus.Resolved,
  );
}

import { computed, Directive, inject, input } from '@angular/core';
import { RadianAvatarContext } from './avatar-context';

@Directive({
  selector: '[radianAvatarImage]',
  host: {
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

  private context = inject(RadianAvatarContext);
  protected hidden = computed(
    () => this.context.resource.status() !== 'resolved',
  );
}

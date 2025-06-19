import { Component, inject, input } from '@angular/core';
import { RadianVisuallyHidden } from '@loozo/radian/visually-hidden';
import { RadianToastsProviderContext } from './toasts-provider-context';

@Component({
  selector: 'radian-toast-announce',
  hostDirectives: [RadianVisuallyHidden],
  host: {
    // Toasts are always role=status to avoid stuttering issues with role=alert in SRs.
    role: 'status',
    '[attr.aria-live]': "type() === 'foreground' ? 'assertive' : 'polite'",
    'aria-atomic': '',
  },
  template: `{{ context.label() }} {{ text() }}`,
})
export class RadianToastAnnounce {
  text = input.required<string>();
  type = input.required<'foreground' | 'background'>();

  protected context = inject(RadianToastsProviderContext);
}

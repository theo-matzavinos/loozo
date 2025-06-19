import { computed, Directive, inject, input } from '@angular/core';
import { RadianSliderThumbContext } from './slider-thumb-context';

@Directive({
  selector: '[radianSliderThumbTrigger]',
  host: {
    role: 'slider',
    '[attr.aria-label]': 'ariaLabel() ?? label()',
    '[attr.aria-valuemin]': 'context.min()',
    '[attr.aria-valuenow]': 'context.value()',
    '[attr.aria-valuemax]': 'context.max()',
    '[attr.aria-orientation]': 'context.orientation()',
    '[attr.data-orientation]': 'context.orientation()',
    '[attr.data-disabled]': 'context.disabled() || null',
    '[attr.tabindex]': 'context.disabled() ? null : 0',
    /**
     * There will be no value on initial render while we work out the index so we hide thumbs
     * without a value, otherwise SSR will render them in the wrong position before they
     * snap into the correct position during hydration which would be visually jarring for
     * slower connections.
     */
    '[style]': `{ display: context.value() == undefined ? 'none' : '' }`,
    '(focus)': 'context.focused()',
  },
})
export class RadianSliderThumbTrigger {
  /** Accessible label for the thumb trigger. */
  ariaLabel = input<string>();

  protected context = inject(RadianSliderThumbContext);
  protected label = computed(() => {
    const totalValues = this.context.values().length;

    if (totalValues > 2) {
      return `Value ${this.context.index() + 1} of ${totalValues}`;
    } else if (totalValues === 2) {
      return ['Minimum', 'Maximum'][this.context.index()];
    } else {
      return undefined;
    }
  });
}

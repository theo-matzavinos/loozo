import { Directive } from '@angular/core';

@Directive({
  selector: '[radianScrollAreaContent]',
  host: {
    /**
     * `display: table` ensures our content div will match the size of its children in both
     * horizontal and vertical axis so we can determine if scroll width/height changed and
     * recalculate thumb sizes. This doesn't account for children with *percentage*
     * widths that change. We'll wait to see what use-cases consumers come up with there
     * before trying to resolve it.
     */
    '[style]': `{
      minWidth: '100%',
      display: 'table',
    }`,
  },
})
export class RadianScrollAreaContent {}

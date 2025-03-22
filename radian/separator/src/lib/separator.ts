import { booleanAttribute, Directive, input } from '@angular/core';
import { RadianOrientation } from '@loozo/radian/common';

@Directive({
  selector: '[radianSeparator]',
  exportAs: 'radianSeparator',
  host: {
    '[attr.role]': 'decorative() ? "none" : "separator"',
    '[attr.aria-orientation]': 'decorative() ? null : orientation()',
  },
})
export class RadianSeparator {
  /** Either `vertical` or `horizontal`. Defaults to `horizontal`. */
  orientation = input<RadianOrientation>(RadianOrientation.Horizontal);
  /**
   * Whether or not the component is purely decorative. When true, accessibility-related attributes
   * are updated so that that the rendered element is removed from the accessibility tree.
   */
  decorative = input(false, { transform: booleanAttribute });
}

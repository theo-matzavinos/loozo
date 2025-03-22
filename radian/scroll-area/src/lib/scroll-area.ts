import {
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { RadianDirection, RadianDirectionality } from '@loozo/radian/common';
import {
  RadianScrollAreaContext,
  RadianScrollAreaType,
} from './scroll-area-context';

@Directive({
  selector: '[radianScrollArea]',
  hostDirectives: [
    { directive: RadianDirection, inputs: ['radianDirection:dir'] },
    {
      directive: RadianScrollAreaContext,
      inputs: ['type', 'hideDelayMs', 'dir'],
    },
  ],
  host: {
    'data-radian-scroll-area': '',
    '[style]': `{
      position: 'relative',
      '--radian-scroll-area-corner-width': cornerWidth(),
      '--radian-scroll-area-corner-height': cornerHeight(),
    }`,
  },
})
export class RadianScrollArea {
  /**
   * Describes the nature of scrollbar visibility, similar to how the scrollbar preferences in MacOS control visibility of native scrollbars.
   * - `auto` means that scrollbars are visible when content is overflowing on the corresponding orientation.
   * - `always` means that scrollbars are always visible regardless of whether the content is overflowing.
   * - `scroll` means that scrollbars are visible when the user is scrolling along its corresponding orientation.
   * - `hover` when the user is scrolling along its corresponding orientation and when the user is hovering over the scroll area.
   */
  type = input<RadianScrollAreaType>(RadianScrollAreaType.Hover);
  /**
   * If type is set to either `scroll` or `hover`, this prop determines the length of time, in milliseconds,
   * before the scrollbars are hidden after the user stops interacting with scrollbars.
   */
  hideDelayMs = input(600, { transform: numberAttribute });
  /**
   * The direction of navigation between items.
   */
  dir = input<RadianDirectionality>();
  /**
   * An optional nonce attribute that is passed to the inline styles for use in CSP-enabled environments that use strict rules to enhance security.
   */
  nonce = input<string>();

  /** @internal */
  elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
}

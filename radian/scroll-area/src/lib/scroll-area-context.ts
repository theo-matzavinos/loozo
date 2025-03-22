import {
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  numberAttribute,
  Signal,
} from '@angular/core';
import { RadianDirectionality, RadianEnum } from '@loozo/radian/common';
import { RadianScrollAreaViewport } from './scroll-area-viewport';

export const RadianScrollAreaType = {
  Auto: 'auto',
  Always: 'always',
  Scroll: 'scroll',
  Hover: 'hover',
} as const;

export type RadianScrollAreaType = RadianEnum<typeof RadianScrollAreaType>;

@Directive()
export class RadianScrollAreaContext {
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

  /** The scroll area's root element. */
  elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  /** The scroll area's viewport. */
  viewport = contentChild.required(RadianScrollAreaViewport);
  /** The scroll area's content. */
  content!: Signal<unknown>;
  /** The scroll area's horizontal scrollbar. */
  horizontalScrollbar!: Signal<unknown>;
  /** The scroll area's vertical scrollbar. */
  verticalScrollbar!: Signal<unknown>;
  /** The width of the corner element. */
  cornerWidth!: Signal<number>;
  /** The height of the corner element. */
  cornerHeight!: Signal<number>;
}

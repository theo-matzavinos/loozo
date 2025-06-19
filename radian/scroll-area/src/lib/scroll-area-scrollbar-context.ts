import {
  ElementRef,
  InjectionToken,
  Signal,
  WritableSignal,
} from '@angular/core';
import { clampNumber, Direction } from '@loozo/radian/common';

export type Sizes = {
  content: number;
  viewport: number;
  scrollbar: {
    size: number;
    paddingStart: number;
    paddingEnd: number;
  };
};

export type RadianScrollAreaScrollbarContext = {
  hasThumb: Signal<boolean>;
  scrollbar: ElementRef<HTMLElement>;
  onThumbPointerUp(): void;
  onThumbPointerDown(pointerPos: { x: number; y: number }): void;
  onThumbPositionChange(): void;
  sizes: WritableSignal<Sizes>;
  pointerOffset: WritableSignal<number>;
  thumb: Signal<ElementRef<HTMLElement>>;
};

export const RadianScrollAreaScrollbarContext =
  new InjectionToken<RadianScrollAreaScrollbarContext>(
    '[Radian] Scroll Area Scrollbar Context',
  );

export function getThumbRatio(viewportSize: number, contentSize: number) {
  const ratio = viewportSize / contentSize;

  return isNaN(ratio) ? 0 : ratio;
}

export function getThumbSize(sizes: Sizes) {
  const ratio = getThumbRatio(sizes.viewport, sizes.content);
  const scrollbarPadding =
    sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
  const thumbSize = (sizes.scrollbar.size - scrollbarPadding) * ratio;

  // minimum of 18 matches macOS minimum
  return Math.max(thumbSize, 18);
}

// https://github.com/tmcw-up-for-adoption/simple-linear-scale/blob/master/index.js
export function linearScale(
  input: readonly [number, number],
  output: readonly [number, number],
) {
  return (value: number) => {
    if (input[0] === input[1] || output[0] === output[1]) return output[0];
    const ratio = (output[1] - output[0]) / (input[1] - input[0]);
    return output[0] + ratio * (value - input[0]);
  };
}

export function getThumbOffsetFromScroll(
  scrollPos: number,
  sizes: Sizes,
  dir: Direction = 'ltr',
) {
  const thumbSizePx = getThumbSize(sizes);
  const scrollbarPadding =
    sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
  const scrollbar = sizes.scrollbar.size - scrollbarPadding;
  const maxScrollPos = sizes.content - sizes.viewport;
  const maxThumbPos = scrollbar - thumbSizePx;
  const scrollClampRange =
    dir === 'ltr' ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
  const scrollWithoutMomentum = clampNumber(
    scrollPos,
    scrollClampRange as [number, number],
  );
  const interpolate = linearScale([0, maxScrollPos], [0, maxThumbPos]);
  return interpolate(scrollWithoutMomentum);
}

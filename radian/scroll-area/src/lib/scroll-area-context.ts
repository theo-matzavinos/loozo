import {
  ElementRef,
  InjectionToken,
  Signal,
  WritableSignal,
} from '@angular/core';
import { Direction } from '@loozo/radian/common';

export type RadianScrollAreaContext = {
  type: Signal<'auto' | 'always' | 'scroll' | 'hover'>;
  dir: Signal<Direction>;
  scrollHideDelay: Signal<number>;
  scrollArea: ElementRef<HTMLElement>;
  viewport: Signal<ElementRef<HTMLElement>>;
  content: Signal<ElementRef<HTMLElement>>;
  horizontalScrollbar: Signal<ElementRef<HTMLElement> | undefined>;
  horizontalScrollbarEnabled: Signal<boolean>;
  verticalScrollbar: Signal<ElementRef<HTMLElement> | undefined>;
  verticalScrollbarEnabled: Signal<boolean>;
  cornerHeight: WritableSignal<number>;
  cornerWidth: WritableSignal<number>;
};

export const RadianScrollAreaContext =
  new InjectionToken<RadianScrollAreaContext>('[Radian] Scroll Area Context');

import {
  Signal,
  InjectionToken,
  ElementRef,
  WritableSignal,
} from '@angular/core';

export type RadianSelectContentContext = {
  content: ElementRef<HTMLElement>;
  viewport: Signal<ElementRef<HTMLElement>>;
  itemUnhovered(): void;
  focusSelectedItem(): void;
  isPositioned: WritableSignal<boolean>;
  selectedItem: Signal<ElementRef<HTMLElement> | undefined>;
  selectedItemText: Signal<ElementRef<HTMLElement> | undefined>;
  search: Signal<string>;
  canScrollUp: WritableSignal<boolean>;
  canScrollDown: WritableSignal<boolean>;
};

export const RadianSelectContentContext =
  new InjectionToken<RadianSelectContentContext>(
    '[Radian] Select Content Context',
  );

export const CONTENT_MARGIN = 10;

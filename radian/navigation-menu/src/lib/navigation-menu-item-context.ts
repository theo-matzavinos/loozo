import {
  ElementRef,
  InjectionToken,
  Signal,
  WritableSignal,
} from '@angular/core';

export type RadianNavigationMenuItemContext = {
  value: Signal<string>;
  contentId: Signal<string>;
  triggerId: Signal<string>;
  trigger: Signal<ElementRef<HTMLElement> | undefined>;
  content: Signal<ElementRef<HTMLElement>>;
  focusProxy: Signal<ElementRef<HTMLElement> | undefined>;
  wasEscapeClose: WritableSignal<boolean>;
  entryKeyDown(side?: string): void;
  focusProxyFocused(side: string): void;
  rootContentClosed(): void;
  contentFocusedOutside(): void;
};

export const RadianNavigationMenuItemContext =
  new InjectionToken<RadianNavigationMenuItemContext>(
    '[Radian] Navigation Menu Item Context',
  );

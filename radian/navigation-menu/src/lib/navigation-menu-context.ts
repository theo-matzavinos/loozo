import { Signal, ElementRef, InjectionToken } from '@angular/core';
import { Subject } from 'rxjs';

export type RadianNavigationMenuContext = {
  isRoot: boolean;
  value: Signal<string | undefined>;
  previousValue: Signal<string | undefined>;
  track: Signal<ElementRef<HTMLElement> | undefined>;
  dir: Signal<'ltr' | 'rtl' | undefined>;
  orientation: Signal<'horizontal' | 'vertical'>;
  root: HTMLElement;
  triggers: Signal<
    Array<{ elementRef: ElementRef<HTMLElement>; value: Signal<string> }>
  >;
  viewport: Signal<ElementRef<HTMLElement>>;
  triggerHovered(itemValue: string): void;
  triggerUnhovered(): void;
  contentHovered(): void;
  contentUnhovered(): void;
  itemSelected: (itemValue: string) => void;
  itemDismissed(): void;
  triggerAdded(value: Signal<string>, trigger: ElementRef<HTMLElement>): void;
  triggerRemoved(trigger: ElementRef<HTMLElement>): void;
  rootContentDismissed: Subject<void>;
};

export const RadianNavigationMenuContext =
  new InjectionToken<RadianNavigationMenuContext>(
    '[Radian] Navigation Menu Context',
  );

import { ElementRef, InjectionToken, Signal } from '@angular/core';
import { Subject } from 'rxjs';

export type RadianTooltipContext = {
  isOpen: Signal<boolean>;
  state: Signal<'closed' | 'delayed-open' | 'instant-open'>;
  trigger: Signal<ElementRef<HTMLElement>>;
  contentId: string;
  tooltipOpen: Subject<void>;
  isPointerInTransit: Signal<boolean>;
  open(): void;
  close(): void;
  pointerInTransitChanged(inTransit: boolean): void;
  triggerHovered(): void;
  triggerUnhovered(): void;
};

export const RadianTooltipContext = new InjectionToken<RadianTooltipContext>(
  '[Radian] Tooltip Context',
);

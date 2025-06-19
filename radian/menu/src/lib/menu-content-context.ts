import { Signal, InjectionToken } from '@angular/core';

export type Point = { x: number; y: number };
export type Polygon = Point[];
export type RadianMenuContentSide = 'left' | 'right';
export type GraceIntent = { area: Polygon; side: RadianMenuContentSide };

export type RadianMenuContentContext = {
  search: Signal<string | undefined>;
  itemHovered(event: PointerEvent): void;
  itemUnhovered(event: PointerEvent): void;
  onTriggerLeave(event: PointerEvent): void;
  onPointerGraceIntentChange(intent: GraceIntent | null): void;
};

export const RadianMenuContentContext =
  new InjectionToken<RadianMenuContentContext>('[Radian] Menu Content Context');

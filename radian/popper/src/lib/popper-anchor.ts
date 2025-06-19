import { InjectionToken, Provider } from '@angular/core';

export type RadianPopperAnchor = {
  getBoundingClientRect(): DOMRect;
};

export const RadianPopperAnchor = new InjectionToken<RadianPopperAnchor>(
  '[Radian] Popper Anchor',
);

export function provideRadianPopperAnchor(
  factory: () => RadianPopperAnchor,
): Provider {
  return { provide: RadianPopperAnchor, useFactory: factory };
}

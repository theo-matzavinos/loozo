import {
  Directive,
  effect,
  inject,
  InjectionToken,
  Provider,
  Signal,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';

export type RadianPresenceContext = {
  present: Signal<boolean>;
};

export const RadianPresenceContext = new InjectionToken<RadianPresenceContext>(
  '[Radian] Presence Context',
);

export function provideRadianPresenceContext(
  contextFactory: () => RadianPresenceContext,
): Provider {
  return { provide: RadianPresenceContext, useFactory: contextFactory };
}

@Directive()
export class RadianPresence {
  constructor() {
    const context = inject(RadianPresenceContext);
    const viewContainerRef = inject(ViewContainerRef);
    const templateRef = inject(TemplateRef);

    effect((onCleanup) => {
      if (context.present()) {
        const view = viewContainerRef.createEmbeddedView(templateRef);

        onCleanup(() => view.destroy());
      }
    });
  }
}

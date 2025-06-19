import {
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { RadianSelectContext } from './select-context';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import {
  provideRadianDismissibleLayerContext,
  RadianDismissibleLayer,
} from '@loozo/radian/dismissible-layer';
import {
  provideRadianRemoveScrollContext,
  RadianRemoveScroll,
} from '@loozo/radian/remove-scroll';
import { RadianFocusGuards } from '@loozo/radian/focus-guards';
import { fromEvent, map, race, switchMap, take } from 'rxjs';

@Directive({
  selector: '[radianSelectPanel]',
  providers: [
    provideRadianRemoveScrollContext(() => {
      return {
        enabled: computed(() => true),
        allowPinchZoom: true,
      };
    }),
    provideRadianDismissibleLayerContext(() => {
      return {
        disableOutsidePointerEvents: computed(() => true),
      };
    }),
  ],
  hostDirectives: [
    RadianFocusGuards,
    RadianRemoveScroll,
    RadianDismissibleLayer,
  ],
})
export class RadianSelectPanel {
  private dismissibleLayer = inject(RadianDismissibleLayer);

  escapeKeyDown = outputFromObservable(
    outputToObservable(this.dismissibleLayer.escapeKeyDown),
  );
  pointerDownOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.pointerDownOutside),
  );

  private templateRef = contentChild.required<TemplateRef<void>>(TemplateRef);

  constructor() {
    const context = inject(RadianSelectContext);

    // When focus is trapped, a `focusout` event may still happen.
    // We make sure we don't trigger our `dismissed` in such case.
    this.dismissibleLayer.focusOutside.subscribe((e) => e.preventDefault());
    this.dismissibleLayer.dismissed.subscribe(() => context.setOpen(false));

    const viewContainerRef = inject(ViewContainerRef);
    const injector = inject(Injector);
    const embeddedViewRef = computed(() =>
      this.templateRef().createEmbeddedView(undefined, injector),
    );
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    effect((onCleanup) => {
      const viewRef = embeddedViewRef();

      onCleanup(() => viewRef.destroy());
    });

    effect((onCleanup) => {
      if (!context.open()) {
        return;
      }

      const viewRef = viewContainerRef.insert(embeddedViewRef());
      const pointerEvents = fromEvent<PointerEvent>(
        elementRef.nativeElement,
        'pointermove',
      )
        .pipe(
          switchMap((pointerMove) =>
            fromEvent<PointerEvent>(elementRef.nativeElement, 'pointerup', {
              capture: true,
            }).pipe(map((pointerUp) => ({ pointerMove, pointerUp }))),
          ),
          take(1),
        )
        .subscribe(({ pointerMove, pointerUp }) => {
          const pointerMoveDelta = {
            x: Math.abs(
              Math.round(pointerMove.pageX) -
                (context.triggerPointerDownPos()?.x ?? 0),
            ),
            y: Math.abs(
              Math.round(pointerMove.pageY) -
                (context.triggerPointerDownPos()?.y ?? 0),
            ),
          };

          // If the pointer hasn't moved by a certain threshold then we prevent selecting item on `pointerup`.
          if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
            pointerUp.preventDefault();
          } else {
            // otherwise, if the event was outside the content, close.
            if (
              !elementRef.nativeElement.contains(
                pointerUp.target as HTMLElement,
              )
            ) {
              context.setOpen(false);
            }
          }
          context.triggerPointerDownPos.set(undefined);
        });
      const globalEvents = race(
        fromEvent(window, 'blur'),
        fromEvent(window, 'resize'),
      ).subscribe(() => context.setOpen(false));

      onCleanup(() => {
        viewContainerRef.detach(viewContainerRef.indexOf(viewRef));
        pointerEvents.unsubscribe();
        globalEvents.unsubscribe();
      });
    });
  }
}

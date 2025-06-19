import {
  afterNextRender,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  isDevMode,
  signal,
} from '@angular/core';
import { RadianDialogTitle } from './dialog-title';
import { RadianDialogDescription } from './dialog-description';
import {
  provideRadianFocusScopeContext,
  RadianFocusScope,
} from '@loozo/radian/focus-scope';
import {
  provideRadianDismissibleLayerContext,
  RadianDismissibleLayer,
} from '@loozo/radian/dismissible-layer';
import { RadianFocusGuards } from '@loozo/radian/focus-guards';
import { RadianDialogContext } from './dialog-context';
import { hideOthers } from 'aria-hidden';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';

@Directive({
  selector: '[radianDialogContent]',
  providers: [
    provideRadianDismissibleLayerContext(() => {
      const context = inject(RadianDialogContext);

      return {
        disableOutsidePointerEvents: context.modal,
      };
    }),
    provideRadianFocusScopeContext(() => {
      const context = inject(RadianDialogContext);

      return () => ({
        loop: computed(() => true),
        trapped: computed(() => context.modal() && context.open()),
      });
    }),
  ],
  hostDirectives: [RadianFocusGuards, RadianDismissibleLayer, RadianFocusScope],
  host: {
    role: 'dialog',
    '[attr.id]': 'context.contentId()',
    '[attr.aria-describedby]': 'context.descriptionId()',
    '[attr.aria-labelledby]': 'context.titleId()',
    '[attr.data-state]': 'context.state()',
  },
})
export class RadianDialogContent {
  private dismissibleLayer = inject(RadianDismissibleLayer);
  private focusScope = inject(RadianFocusScope);
  /**
   * Event handler called when auto-focusing on mount.
   * Can be prevented.
   */
  mountAutoFocus = outputFromObservable(
    outputToObservable(this.focusScope.mountAutoFocus),
  );

  /**
   * Event handler called when auto-focusing on unmount.
   * Can be prevented.
   */
  unmountAutoFocus = outputFromObservable(
    outputToObservable(this.focusScope.unmountAutoFocus),
  );
  /**
   * Event handler called when the escape key is down.
   * Can be prevented.
   */
  escapeKeyDown = outputFromObservable(
    outputToObservable(this.dismissibleLayer.escapeKeyDown),
  );
  /**
   * Emits when a `pointerdown` event happens outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  pointerDownOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.pointerDownOutside),
  );
  /**
   * Emits when the focus moves outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  focusOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.focusOutside),
  );
  /**
   * Emits when an interaction happens outside the `RadianDismissibleLayer`.
   * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
   * Can be prevented.
   */
  interactionOutside = outputFromObservable(
    outputToObservable(this.dismissibleLayer.interactionOutside),
  );

  protected context = inject(RadianDialogContext);
  private title = contentChild(RadianDialogTitle, { descendants: true });
  private description = contentChild(RadianDialogDescription, {
    descendants: true,
  });

  constructor() {
    if (isDevMode()) {
      effect(() => {
        if (!this.title()) {
          console.warn(`A title element is required for the dialog to be accessible for screen reader users.
          If you want to hide the title element, you can wrap it with our RadianVisuallyHidden directive.`);
        }
        if (!this.description()) {
          console.warn(`A description element is required for the dialog to be accessible for screen reader users.
          If you want to hide the description element, you can wrap it with our RadianVisuallyHidden directive.`);
        }
      });
    }

    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    effect((onCleanup) => {
      if (this.context.modal()) {
        const undo = hideOthers(elementRef.nativeElement);

        onCleanup(undo);
      }
    });

    const focusScope = inject(RadianFocusScope);
    const dismissibleLayer = inject(RadianDismissibleLayer);
    const hasInteractedOutside = signal(false);
    const hasPointerDownOutside = signal(false);

    afterNextRender(() => {
      focusScope.unmountAutoFocus.subscribe((event) => {
        if (this.context.modal()) {
          event.preventDefault();
          this.context.trigger()?.nativeElement.focus();

          return;
        }

        hasInteractedOutside.set(false);
        hasPointerDownOutside.set(false);

        if (event.defaultPrevented) {
          return;
        }

        if (!hasInteractedOutside()) {
          this.context.trigger()?.nativeElement.focus();
        }
        // Always prevent auto focus because we either focus manually or want user agent focus
        event.preventDefault();
      });

      dismissibleLayer.pointerDownOutside.subscribe((event) => {
        if (!this.context.modal()) {
          return;
        }

        const ctrlLeftClick = event.button === 0 && event.ctrlKey === true;
        const isRightClick = event.button === 2 || ctrlLeftClick;

        // If the event is a right-click, we shouldn't close because
        // it is effectively as if we right-clicked the `Overlay`.
        if (isRightClick) {
          event.preventDefault();
        }
      });

      dismissibleLayer.focusOutside.subscribe((event) => {
        if (this.context.modal()) {
          // When focus is trapped, a `focusout` event may still happen.
          // We make sure we don't trigger our `onDismiss` in such case.
          event.preventDefault();
        }
      });
      dismissibleLayer.interactionOutside.subscribe((event) => {
        if (this.context.modal()) {
          return;
        }

        if (!event.defaultPrevented) {
          hasInteractedOutside.set(true);
          if (event.type === 'pointerdown') {
            hasPointerDownOutside.set(true);
          }
        }

        // Prevent dismissing when clicking the trigger.
        // As the trigger is already setup to close, without doing so would
        // cause it to close and immediately open.
        const target = event.target as HTMLElement;
        const targetIsTrigger = this.context
          .trigger()
          ?.nativeElement.contains(target);

        if (targetIsTrigger) {
          event.preventDefault();
        }

        // On Safari if the trigger is inside a container with tabIndex={0}, when clicked
        // we will get the pointer down outside event on the trigger, but then a subsequent
        // focus outside event on the container, we ignore any focus outside event when we've
        // already had a pointer down outside event.
        if (event.type === 'focusin' && hasPointerDownOutside()) {
          event.preventDefault();
        }
      });

      dismissibleLayer.dismissed.subscribe(() => this.context.setOpen(false));
    });
  }
}

import { computed, Directive, effect, inject, output } from '@angular/core';
import {
  provideRadianRemoveScrollContext,
  RadianRemoveScroll,
} from '@loozo/radian/remove-scroll';
import { RadianPopoverContext } from './popover';
import {
  provideRadianFocusScopeContext,
  RadianFocusScope,
} from '@loozo/radian/focus-scope';
import {
  provideRadianDismissibleLayerContext,
  RadianDismissibleLayer,
} from '@loozo/radian/dismissible-layer';
import {
  outputFromObservable,
  outputToObservable,
} from '@angular/core/rxjs-interop';
import { RadianPopperContent } from '@loozo/radian/popper';

@Directive({
  selector: '[radianPopoverContent]',

  providers: [
    provideRadianRemoveScrollContext(() => {
      const popoverContext = inject(RadianPopoverContext);

      return {
        enabled: popoverContext.modal,
        allowPinchZoom: true,
      };
    }),
    provideRadianFocusScopeContext(() => {
      const popoverContent = inject(RadianPopoverContent);

      return {
        loop: computed(() => true),
        trapped: popoverContent.trapFocus,
      };
    }),
    provideRadianDismissibleLayerContext(() => {
      const popoverContent = inject(RadianPopoverContent);

      return {
        disableOutsidePointerEvents: popoverContent.disableOutsidePointerEvents,
      };
    }),
  ],
  hostDirectives: [
    RadianRemoveScroll,
    RadianFocusScope,
    RadianDismissibleLayer,
    RadianPopperContent,
  ],
  host: {
    role: 'dialog',
    '[attr.id]': 'context.contentId()',
    '[attr.data-state]': 'context.open() ? "open" : "closed"',
    '[style]': `{
      '--radian-popover-content-transform-origin': 'var(--radian-popper-transform-origin)',
      '--radian-popover-content-available-width': 'var(--radian-popper-available-width)',
      '--radian-popover-content-available-height': 'var(--radian-popper-available-height)',
      '--radian-popover-trigger-width': 'var(--radian-popper-anchor-width)',
      '--radian-popover-trigger-height': 'var(--radian-popper-anchor-height)',
    }`,
  },
})
export class RadianPopoverContent {
  private focusScope = inject(RadianFocusScope);
  private dismissibleLayer = inject(RadianDismissibleLayer);
  /**
   * Emits when auto-focusing on open.
   * Can be prevented.
   */
  openAutoFocus = outputFromObservable(
    outputToObservable(this.focusScope.mountAutoFocus),
  );

  /**
   * Emits when auto-focusing on close.
   * Can be prevented.
   */
  closeAutoFocus = output<Event>();
  /**
   * Emits when the escape key is down.
   * Can be prevented.
   */
  escapeKeyDown = output<KeyboardEvent>();
  /**
   * Emits when a `pointerdown` event happens outside of the `RadianPopoverContent`.
   * Can be prevented.
   */
  pointerDownOutside = output<PointerEvent>();
  /**
   * Emits when the focus moves outside of the `RadianPopoverContent`.
   * Can be prevented.
   */
  focusOutside = output<FocusEvent>();
  /**
   * Emits when an interaction happens outside the `RadianPopoverContent`.
   * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
   * Can be prevented.
   */
  interactionOutside = output<PointerEvent | FocusEvent>();

  protected context = inject(RadianPopoverContext);

  private trapFocus = computed(
    () => this.context.modal() && this.context.open(),
  );
  private disableOutsidePointerEvents = this.context.modal;

  constructor() {
    effect((onCleanup) => {
      const subscriptions = this.context.modal()
        ? this.setupModalOutputs()
        : this.setupNonModalOutputs();

      onCleanup(() => subscriptions.forEach((s) => s.unsubscribe()));
    });
  }

  private setupNonModalOutputs() {
    let hasInteractedOutside = false;
    let hasPointerDownOutside = false;

    return [
      this.focusScope.unmountAutoFocus.subscribe((event) => {
        this.closeAutoFocus.emit(event);

        if (!event.defaultPrevented) {
          if (!hasInteractedOutside) {
            this.context.trigger().focus();
          }
          // Always prevent auto focus because we either focus manually or want user agent focus
          event.preventDefault();
        }

        hasInteractedOutside = false;
        hasPointerDownOutside = false;
      }),
      this.dismissibleLayer.interactionOutside.subscribe((event) => {
        this.interactionOutside.emit(event);

        if (!event.defaultPrevented) {
          hasInteractedOutside = true;
          if (event.type === 'pointerdown') {
            hasPointerDownOutside = true;
          }
        }

        // Prevent dismissing when clicking the trigger.
        // As the trigger is already setup to close, without doing so would
        // cause it to close and immediately open.
        const target = event.target as HTMLElement;
        const targetIsTrigger = this.context.trigger().contains(target);
        if (targetIsTrigger) event.preventDefault();

        // On Safari if the trigger is inside a container with tabIndex={0}, when clicked
        // we will get the pointer down outside event on the trigger, but then a subsequent
        // focus outside event on the container, we ignore any focus outside event when we've
        // already had a pointer down outside event.
        if (event.type === 'focusin' && hasPointerDownOutside) {
          event.preventDefault();
        }
      }),
    ];
  }

  private setupModalOutputs() {
    let isRightClickOutside = false;

    return [
      this.focusScope.unmountAutoFocus.subscribe((event) => {
        this.closeAutoFocus.emit(event);

        event.preventDefault();

        if (!isRightClickOutside) {
          this.context.trigger().focus();
        }
      }),
      this.dismissibleLayer.pointerDownOutside.subscribe((event) => {
        this.pointerDownOutside.emit(event);

        const ctrlLeftClick = event.button === 0 && event.ctrlKey === true;
        const isRightClick = event.button === 2 || ctrlLeftClick;

        isRightClickOutside = isRightClick;
      }),

      this.dismissibleLayer.focusOutside.subscribe((event) =>
        event.preventDefault(),
      ),
    ];
  }
}

import {
  afterNextRender,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  output,
  Provider,
  Signal,
  signal,
} from '@angular/core';
import { RadianPointerDownOutside } from './pointer-down-outside';
import { RadianFocusOutside } from './focus-outside';
import { RadianEscapeKeyDown } from '@loozo/radian/common';

let originalBodyPointerEvents: string;

export const RadianDismissibleLayersGlobalContext = new InjectionToken(
  '[Radian] Dismissible Layers Global Context',
  {
    factory() {
      const layers = signal<RadianDismissibleLayer[]>([]);

      return {
        layers,
        layersWithOutsidePointerEventsDisabled: computed(() =>
          layers().filter((i) => i.disableOutsidePointerEvents()),
        ),
        branches: signal<HTMLElement[]>([]),
      };
    },
  },
);

export type RadianDismissibleLayerContext = {
  disableOutsidePointerEvents: Signal<boolean>;
};

export const RadianDismissibleLayerContext =
  new InjectionToken<RadianDismissibleLayerContext>(
    '[Radian] Dismissible Layer Context',
  );

export function provideRadianDismissibleLayerContext(
  factory: () => RadianDismissibleLayerContext,
): Provider {
  return { provide: RadianDismissibleLayerContext, useFactory: factory };
}

@Directive({
  selector: '[radianDismissibleLayer]',
  hostDirectives: [
    RadianPointerDownOutside,
    RadianFocusOutside,
    RadianEscapeKeyDown,
  ],
  host: {
    '[style]': `{ pointerEvents: pointerEvents() }`,
  },
})
export class RadianDismissibleLayer {
  /**
   * Event handler called when the escape key is down.
   * Can be prevented.
   */
  escapeKeyDown = output<KeyboardEvent>();
  /**
   * Emits when a `pointerdown` event happens outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  pointerDownOutside = output<PointerEvent>();
  /**
   * Emits when the focus moves outside of the `RadianDismissibleLayer`.
   * Can be prevented.
   */
  focusOutside = output<Event>();
  /**
   * Emits when an interaction happens outside the `RadianDismissibleLayer`.
   * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
   * Can be prevented.
   */
  interactionOutside = output<Event>();
  /**
   * Handler called when the `RadianDismissibleLayer` should be dismissed
   */
  dismissed = output<void>();

  private context = inject(RadianDismissibleLayerContext);

  /**
   * When `true`, hover/focus/click interactions will be disabled on elements outside
   * the `RadianDismissibleLayer`. Users will need to click twice on outside elements to
   * interact with them: once to close the `RadianDismissibleLayer`, and again to trigger the element.
   */
  disableOutsidePointerEvents = this.context.disableOutsidePointerEvents;

  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private globalContext = inject(RadianDismissibleLayersGlobalContext);
  private highestLayerWithOutsidePointerEventsDisabled = computed(() => {
    const [result] = this.globalContext
      .layersWithOutsidePointerEventsDisabled()
      .slice(-1);

    return result;
  });
  private highestLayerWithOutsidePointerEventsDisabledIndex = computed(() =>
    this.globalContext
      .layers()
      .indexOf(this.highestLayerWithOutsidePointerEventsDisabled()),
  );
  private index = computed(() => this.globalContext.layers().indexOf(this));
  private isBodyPointerEventsDisabled = computed(
    () =>
      this.globalContext.layersWithOutsidePointerEventsDisabled().length > 0,
  );

  private isPointerEventsEnabled = computed(
    () =>
      this.index() >= this.highestLayerWithOutsidePointerEventsDisabledIndex(),
  );

  protected pointerEvents = computed(() =>
    this.isBodyPointerEventsDisabled()
      ? this.isPointerEventsEnabled()
        ? 'auto'
        : 'none'
      : undefined,
  );

  constructor() {
    this.globalContext.layers.update((v) => [...v, this]);

    const injector = inject(Injector);
    const hasLayerWithOutsidePointerEventsDisabled = computed(
      () =>
        this.globalContext.layersWithOutsidePointerEventsDisabled().length ===
        0,
    );

    afterNextRender(() => {
      const ownerDocument =
        this.elementRef.nativeElement.ownerDocument ?? globalThis.document;

      effect(
        (onCleanup) => {
          if (this.context.disableOutsidePointerEvents()) {
            if (hasLayerWithOutsidePointerEventsDisabled()) {
              originalBodyPointerEvents =
                ownerDocument.body.style.pointerEvents;
              ownerDocument.body.style.pointerEvents = 'none';
            }
          }

          onCleanup(() => {
            if (
              this.context.disableOutsidePointerEvents() &&
              this.globalContext.layersWithOutsidePointerEventsDisabled
                .length === 1
            ) {
              ownerDocument.body.style.pointerEvents =
                originalBodyPointerEvents;
            }
          });
        },
        { injector },
      );
    });

    inject(RadianPointerDownOutside).pointerDownOutside.subscribe((event) => {
      const target = event.target as HTMLElement;
      const isPointerDownOnBranch = this.globalContext
        .branches()
        .some((branch) => branch.contains(target));

      if (!this.isPointerEventsEnabled() || isPointerDownOnBranch) {
        return;
      }

      this.pointerDownOutside.emit(event);
      this.interactionOutside.emit(event);

      if (!event.defaultPrevented) {
        this.dismissed.emit();
      }
    });

    inject(RadianFocusOutside).focusOutside.subscribe((event) => {
      const target = event.target as HTMLElement;
      const isFocusInBranch = this.globalContext
        .branches()
        .some((branch) => branch.contains(target));

      if (isFocusInBranch) {
        return;
      }

      const e = new CustomEvent('focusoutside', { ...event, cancelable: true });

      this.focusOutside.emit(e);
      this.interactionOutside.emit(e);

      if (!e.defaultPrevented) {
        this.dismissed.emit();
      }
    });

    inject(RadianEscapeKeyDown).escapeKeyDown.subscribe((event) => {
      const isHighestLayer =
        this.index() === this.globalContext.layers().length - 1;

      if (!isHighestLayer) {
        return;
      }

      this.escapeKeyDown.emit(event);

      if (!event.defaultPrevented) {
        event.preventDefault();
        this.dismissed.emit();
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.globalContext.layers.update((v) => v.filter((i) => i !== this));
    });
  }
}

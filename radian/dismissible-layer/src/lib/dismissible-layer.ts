import {
  afterNextRender,
  booleanAttribute,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  output,
  Provider,
  signal,
  untracked,
} from '@angular/core';
import { RadianPointerDownOutside } from './pointer-down-outside';
import { RadianFocusOutside } from './focus-outside';
import { RadianEscapeKeyDown } from '@loozo/radian/common';

let originalBodyPointerEvents: string;

export const RadianDismissibleLayersContext = new InjectionToken(
  '[Radian] Dismissible Layers Context',
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

export type RadianDismissibleLayerDefaults = {
  disableOutsidePointerEvents: boolean;
};

export const RadianDismissibleLayerDefaults =
  new InjectionToken<RadianDismissibleLayerDefaults>(
    '[Radian] Dismissible Layer Defaults',
    {
      factory() {
        return {
          disableOutsidePointerEvents: false,
        };
      },
    },
  );

export function provideRadianDismissibleLayerDefaults(
  value: RadianDismissibleLayerDefaults,
): Provider {
  return { provide: RadianDismissibleLayerDefaults, useValue: value };
}

@Directive({
  selector: '[radianDismissibleLayer]',
  exportAs: 'radianDismissibleLayer',
  hostDirectives: [
    RadianPointerDownOutside,
    RadianFocusOutside,
    RadianEscapeKeyDown,
  ],
  host: {
    'data-radian-dismissible-layer': '',
    '[style]': `{ pointerEvents: 'none'}`,
  },
})
export class RadianDismissibleLayer {
  /**
   * When `true`, hover/focus/click interactions will be disabled on elements outside
   * the `RadianDismissibleLayer`. Users will need to click twice on outside elements to
   * interact with them: once to close the `RadianDismissibleLayer`, and again to trigger the element.
   */
  disableOutsidePointerEvents = input(
    inject(RadianDismissibleLayerDefaults).disableOutsidePointerEvents,
    { transform: booleanAttribute },
  );
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
  focusOutside = output<FocusEvent>();
  /**
   * Emits when an interaction happens outside the `RadianDismissibleLayer`.
   * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
   * Can be prevented.
   */
  interactionOutside = output<PointerEvent | FocusEvent>();
  /**
   * Handler called when the `RadianDismissibleLayer` should be dismissed
   */
  dismissed = output<void>();

  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private context = inject(RadianDismissibleLayersContext);
  private highestLayerWithOutsidePointerEventsDisabled = computed(() => {
    const [result] = this.context
      .layersWithOutsidePointerEventsDisabled()
      .slice(-1);

    return result;
  });
  private highestLayerWithOutsidePointerEventsDisabledIndex = computed(() =>
    this.context
      .layers()
      .indexOf(this.highestLayerWithOutsidePointerEventsDisabled()),
  );
  private index = computed(() => this.context.layers().indexOf(this));
  private isBodyPointerEventsDisabled = computed(
    () => this.context.layersWithOutsidePointerEventsDisabled().length > 0,
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
    this.context.layers.update((v) => [...v, this]);

    const injector = inject(Injector);

    afterNextRender(() => {
      const ownerDocument =
        this.elementRef.nativeElement.ownerDocument ?? globalThis.document;

      effect(
        (onCleanup) => {
          if (this.disableOutsidePointerEvents()) {
            if (
              this.context.layersWithOutsidePointerEventsDisabled().length === 0
            ) {
              originalBodyPointerEvents =
                ownerDocument.body.style.pointerEvents;
              ownerDocument.body.style.pointerEvents = 'none';
            }
          }
          untracked(() => this.context.layers.update((v) => [...v, this]));

          onCleanup(() => {
            if (
              this.disableOutsidePointerEvents() &&
              this.context.layersWithOutsidePointerEventsDisabled.length === 1
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
      const isPointerDownOnBranch = this.context
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
      const isFocusInBranch = this.context
        .branches()
        .some((branch) => branch.contains(target));

      if (isFocusInBranch) {
        return;
      }

      this.focusOutside.emit(event);
      this.interactionOutside.emit(event);

      if (!event.defaultPrevented) {
        this.dismissed.emit();
      }
    });

    inject(RadianEscapeKeyDown).escapeKeyDown.subscribe((event) => {
      const isHighestLayer = this.index() === this.context.layers().length - 1;

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
      this.context.layers.update((v) => v.filter((i) => i !== this));
    });
  }
}

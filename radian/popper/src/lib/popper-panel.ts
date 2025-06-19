import {
  afterNextRender,
  booleanAttribute,
  computed,
  contentChild,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  linkedSignal,
  numberAttribute,
  output,
  PLATFORM_ID,
  Provider,
  resource,
  signal,
} from '@angular/core';
import { RadianPopperArrow } from './popper-arrow';
import {
  computePosition,
  autoUpdate,
  offset,
  shift,
  limitShift,
  hide,
  arrow,
  flip,
  size,
  Placement,
  Middleware,
} from '@floating-ui/dom';
import { elementSize } from '@loozo/radian/common';
import { RadianPopperContent } from './popper-content';
import { isPlatformBrowser } from '@angular/common';
import { RadianPopperAlignment, RadianPopperSide } from './types';
import { RadianPopperContext } from './popper-context';
import { RadianPopperContentContext } from './popper-content-context';

export type RadianPopperPanelDefaults = {
  /**
   * The preferred side of the anchor to render against when open.
   * Will be reversed when collisions occur and avoidCollisions is enabled.
   */
  side: RadianPopperSide;
  /** The distance in pixels from the anchor. */
  sideOffset: number;
  /** The preferred alignment against the anchor. May change when collisions occur. */
  align: RadianPopperAlignment;
  /** An offset in pixels from the `start` or `end` alignment options. */
  alignOffset: number;
  /**
   * The padding between the arrow and the edges of the content.
   * If your content has border-radius, this will prevent it from overflowing the corners.
   */
  arrowPadding: number;
  /** When `true`, overrides the `side` and `align` preferences to prevent collisions with boundary edges. */
  avoidCollisions: boolean;
  /**
   * The distance in pixels from the boundary edges where collision detection should occur.
   * Accepts a number (same for all sides), or a partial padding object, for example: `{ top: 20, left: 20 }`.
   */
  collisionPadding: number | Partial<Record<RadianPopperSide, number>>;
  /**
   * The sticky behavior on the `align` axis.
   * - `partial` will keep the content in the boundary as long as the trigger is at least partially in the boundary
   * - `always` will keep the content in the boundary regardless.
   */
  sticky: 'partial' | 'always';
  /** Whether to hide the content when the trigger becomes fully occluded. */
  hideWhenDetached: boolean;
  /** Whether to update the position of the floating element on every animation frame if required. */
  updatePositionStrategy: 'optimized' | 'always';
};

export const RadianPopperPanelDefaults =
  new InjectionToken<RadianPopperPanelDefaults>(
    '[Radian] Popper Panel Defaults',
    {
      factory() {
        return {
          side: RadianPopperSide.Bottom,
          sideOffset: 0,
          align: RadianPopperAlignment.Center,
          alignOffset: 0,
          arrowPadding: 0,
          avoidCollisions: true,
          collisionPadding: 0,
          sticky: 'partial',
          hideWhenDetached: false,
          updatePositionStrategy: 'optimized',
        };
      },
    },
  );

export function provideRadianPopperPanelDefaults({
  side = RadianPopperSide.Bottom,
  sideOffset = 0,
  align = RadianPopperAlignment.Center,
  alignOffset = 0,
  arrowPadding = 0,
  avoidCollisions = true,
  collisionPadding = 0,
  sticky = 'partial',
  hideWhenDetached = false,
  updatePositionStrategy = 'optimized',
}: Partial<RadianPopperPanelDefaults>): Provider {
  return {
    provide: RadianPopperPanelDefaults,
    useValue: {
      side,
      sideOffset,
      align,
      alignOffset,
      arrowPadding,
      avoidCollisions,
      collisionPadding,
      sticky,
      hideWhenDetached,
      updatePositionStrategy,
    },
  };
}

@Directive({
  providers: [
    {
      provide: RadianPopperContentContext,
      useFactory: RadianPopperPanel.contextFactory,
    },
  ],
  host: {
    '[style]': 'style()',
  },
})
export class RadianPopperPanel {
  private defaults = inject(RadianPopperPanelDefaults);
  /**
   * The preferred side of the anchor to render against when open.
   * Will be reversed when collisions occur and avoidCollisions is enabled.
   */
  side = input<RadianPopperSide>(this.defaults.side);
  /** The distance in pixels from the anchor. */
  sideOffset = input(this.defaults.sideOffset, { transform: numberAttribute });
  /** The preferred alignment against the anchor. May change when collisions occur. */
  align = input<RadianPopperAlignment>(this.defaults.align);
  /** An offset in pixels from the `start` or `end` alignment options. */
  alignOffset = input(this.defaults.alignOffset, {
    transform: numberAttribute,
  });
  /**
   * The padding between the arrow and the edges of the content.
   * If your content has border-radius, this will prevent it from overflowing the corners.
   */
  arrowPadding = input(this.defaults.arrowPadding, {
    transform: numberAttribute,
  });
  /** When `true`, overrides the `side` and `align` preferences to prevent collisions with boundary edges. */
  avoidCollisions = input(this.defaults.avoidCollisions, {
    transform: booleanAttribute,
  });
  /**
   * The element used as the collision boundary.
   * By default this is the viewport, though you can provide additional element(s) to be included in this check.
   */
  collisionBoundary = input<
    ElementRef<HTMLElement> | ElementRef<HTMLElement>[]
  >();
  /**
   * The distance in pixels from the boundary edges where collision detection should occur.
   * Accepts a number (same for all sides), or a partial padding object, for example: `{ top: 20, left: 20 }`.
   */
  collisionPadding = input<number | Partial<Record<RadianPopperSide, number>>>(
    this.defaults.collisionPadding,
  );
  /**
   * The sticky behavior on the `align` axis.
   * - `partial` will keep the content in the boundary as long as the trigger is at least partially in the boundary
   * - `always` will keep the content in the boundary regardless.
   */
  sticky = input<'partial' | 'always'>(this.defaults.sticky);
  /** Whether to hide the content when the trigger becomes fully occluded. */
  hideWhenDetached = input(this.defaults.hideWhenDetached, {
    transform: booleanAttribute,
  });
  /** Whether to update the position of the floating element on every animation frame if required. */
  updatePositionStrategy = input<'optimized' | 'always'>(
    this.defaults.updatePositionStrategy,
  );
  /** Emits when the element is placed. */
  placed = output<void>();

  private _currentSide = linkedSignal(this.side);
  currentSide = this._currentSide.asReadonly();

  arrow = contentChild(RadianPopperArrow);

  private injector = inject(Injector);
  private desiredPlacement = computed(
    () =>
      (this.currentSide() +
        (this.align() !== 'center' ? '-' + this.align() : '')) as Placement,
  );
  private context = inject(RadianPopperContext);
  private elementRef = inject(ElementRef);
  private arrowSize = computed(() => {
    const arrowElementRef = this.arrow()?.elementRef;

    if (!arrowElementRef) {
      return computed(() => ({
        height: 0,
        width: 0,
      }));
    }

    return elementSize({
      elementRef: arrowElementRef,
      injector: this.injector,
    });
  });
  private boundary = computed(() => {
    const boundary = this.collisionBoundary();

    if (Array.isArray(boundary)) {
      return boundary.map((e) => e.nativeElement);
    }

    if (!boundary) {
      return [];
    }

    return [boundary.nativeElement];
  });
  private hasExplicitBoundaries = computed(() => this.boundary().length > 0);
  private detectOverflowOptions = computed(() => ({
    padding: this.collisionPadding(),
    boundary: this.boundary(),
    // with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
    altBoundary: this.hasExplicitBoundaries(),
  }));

  private position = resource({
    loader: () =>
      computePosition(this.context.anchor(), this.elementRef.nativeElement, {
        // default to `fixed` strategy so users don't have to pick and we also avoid focus scroll issues
        strategy: 'fixed',
        placement: this.desiredPlacement(),
        middleware: [
          offset({
            mainAxis: this.sideOffset() + this.arrowSize()().height || 0,
            alignmentAxis: this.alignOffset(),
          }),
          this.avoidCollisions() &&
            shift({
              mainAxis: true,
              crossAxis: false,
              limiter: this.sticky() === 'partial' ? limitShift() : undefined,
              ...this.detectOverflowOptions(),
            }),
          this.avoidCollisions() && flip({ ...this.detectOverflowOptions() }),
          size({
            ...this.detectOverflowOptions(),
            apply: ({ elements, rects, availableWidth, availableHeight }) => {
              const { width: anchorWidth, height: anchorHeight } =
                rects.reference;
              const contentStyle = elements.floating.style;
              contentStyle.setProperty(
                '--radian-popper-available-width',
                `${availableWidth}px`,
              );
              contentStyle.setProperty(
                '--radian-popper-available-height',
                `${availableHeight}px`,
              );
              contentStyle.setProperty(
                '--radian-popper-anchor-width',
                `${anchorWidth}px`,
              );
              contentStyle.setProperty(
                '--radian-popper-anchor-height',
                `${anchorHeight}px`,
              );
            },
          }),
          this.arrow() &&
            arrow({
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              element: this.arrow()!.elementRef.nativeElement,
              padding: this.arrowPadding(),
            }),
          transformOrigin({
            arrowWidth: this.arrowSize()().width,
            arrowHeight: this.arrowSize()().height,
          }),
          this.hideWhenDetached() &&
            hide({
              strategy: 'referenceHidden',
              ...this.detectOverflowOptions(),
            }),
        ],
      }),
  });
  /** Whether the panel is positioned. */
  isPositioned = computed(() => this.position.hasValue());
  /** The current placement of the panel. */
  placement = computed(() => {
    const placement = this.position.value()?.placement;

    if (!placement) {
      return;
    }

    const [side, align = 'center'] = placement.split('-');

    return {
      side: side as RadianPopperSide,
      align: align as RadianPopperAlignment,
    };
  });
  /** The side the panel is currently placed against. */
  placedSide = computed(() => this.placement()?.side);
  /** The current alignment of the panel. */
  placedAlign = computed(() => this.placement()?.align);
  private contentElementRef = contentChild.required<
    RadianPopperContent,
    ElementRef<HTMLElement>
  >(RadianPopperContent, { read: ElementRef });
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected contentZIndex = computed(() => {
    if (!(this.isBrowser && this.contentElementRef())) {
      return 0;
    }

    return getComputedStyle(this.contentElementRef().nativeElement).zIndex;
  });

  protected style = computed(() => ({
    position: 'absolute',
    minWidth: 'max-content',
    zIndex: this.contentZIndex(),
    '--radian-popper-transform-origin': [
      this.position.value()?.middlewareData['transformOrigin']?.x,
      this.position.value()?.middlewareData['transformOrigin']?.y,
    ].join(' '),
    top: this.position.value()?.y ? `${this.position.value()?.y}px` : '',
    left: this.position.value()?.x ? `${this.position.value()?.x}px` : '',
    // used to keep the element off the page when measuring.
    transform: this.isPositioned() ? '' : 'translate(0, -200%)',
    // we hide the content if using the hide middleware and should be hidden
    // by setting visibility to hidden and disabling pointer events so the UI behaves
    // as if the PopperContent isn't there at all
    visibility: this.position.value()?.middlewareData.hide?.referenceHidden
      ? 'hidden'
      : '',
    pointerEvents: this.position.value()?.middlewareData.hide?.referenceHidden
      ? 'none'
      : '',
  }));

  private shouldHideArrow = computed(
    () => this.position.value()?.middlewareData.arrow?.centerOffset !== 0,
  );
  private arrowX = computed(
    () => this.position.value()?.middlewareData.arrow?.x,
  );
  private arrowY = computed(
    () => this.position.value()?.middlewareData.arrow?.y,
  );

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.position.reload();

      const cleanup = autoUpdate(
        this.context.anchor(),
        this.elementRef.nativeElement,
        () => this.position.reload(),
        {
          animationFrame: this.updatePositionStrategy() === 'always',
        },
      );

      destroyRef.onDestroy(cleanup);
    });
  }

  setSide(side: RadianPopperSide) {
    this._currentSide.set(side);
  }

  private static contextFactory(): RadianPopperContentContext {
    const popperPanel = inject(RadianPopperPanel);

    return {
      placedSide: popperPanel.placedSide,
      arrowX: popperPanel.arrowX,
      arrowY: popperPanel.arrowY,
      shouldHideArrow: popperPanel.shouldHideArrow,
      placedAlign: popperPanel.placedAlign,
      isPositioned: popperPanel.isPositioned,
    };
  }
}

function transformOrigin(options: {
  arrowWidth: number;
  arrowHeight: number;
}): Middleware {
  return {
    name: 'transformOrigin',
    options,
    fn(data) {
      const { placement, rects, middlewareData } = data;

      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const isArrowHidden = cannotCenterArrow;
      const arrowWidth = isArrowHidden ? 0 : options.arrowWidth;
      const arrowHeight = isArrowHidden ? 0 : options.arrowHeight;

      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const noArrowAlign = { start: '0%', center: '50%', end: '100%' }[
        placedAlign
      ];

      const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
      const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;

      let x = '';
      let y = '';

      if (placedSide === 'bottom') {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${-arrowHeight}px`;
      } else if (placedSide === 'top') {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${rects.floating.height + arrowHeight}px`;
      } else if (placedSide === 'right') {
        x = `${-arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      } else if (placedSide === 'left') {
        x = `${rects.floating.width + arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      }
      return { data: { x, y } };
    },
  };
}

function getSideAndAlignFromPlacement(placement: Placement) {
  const [side, align = 'center'] = placement.split('-');
  return [side as RadianPopperSide, align as RadianPopperAlignment] as const;
}

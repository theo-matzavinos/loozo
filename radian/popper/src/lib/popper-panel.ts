import {
  afterNextRender,
  booleanAttribute,
  computed,
  contentChild,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  numberAttribute,
  output,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import {} from '@angular/platform-browser';
import { RadianPopperAlignment, RadianPopperSide } from './popper';
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
import { RadianPopperContext } from './popper-context';
import { elementSize } from '@loozo/radian/common';
import { RadianPopperContent } from './popper-content';
import { isPlatformBrowser } from '@angular/common';

export const RadianPopperContentContext = new InjectionToken<
  ReturnType<typeof radianPopperContentContextFactory>
>('[Radian] Popper Content Context');

function radianPopperContentContextFactory() {
  return {
    placedSide: signal<RadianPopperSide>(RadianPopperSide.Bottom),
    arrowX: signal(NaN),
    arrowY: signal(NaN),
    shouldHideArrow: signal(true),
  };
}

@Directive({
  providers: [
    {
      provide: RadianPopperContentContext,
      useFactory: radianPopperContentContextFactory,
    },
  ],
  host: {
    'data-radian-popper-panel': '',
    // transform is used to keep the element off the page when measuring.
    //
    // we hide the content if using the hide middleware and should be hidden
    // by setting visibility to hidden and disabling pointer events so the UI behaves
    // as if the PopperContent isn't there at all
    '[style]': `{
      position: 'absolute',
      minWidth: 'max-content',
      zIndex: contentZIndex(),
      '--radian-popper-transform-origin': [
        position.value()?.middlewareData.transformOrigin?.x,
        position.value()?.middlewareData.transformOrigin?.y,
      ].join(' '),
      top: position.value()?.y ?? '',
      left: position.value()?.x ?? '',

      transform: isPositioned() ? '' : 'translate(0, -200%)',
      visibility: position.value()?.middlewareData.hide?.referenceHidden
        ? 'hidden'
        : '',
      pointerEvents: position.value()?.middlewareData.hide?.referenceHidden
        ? 'none'
        : '',
    }`,
  },
})
export class RadianPopperPanel {
  /**
   * The preferred side of the anchor to render against when open.
   * Will be reversed when collisions occur and avoidCollisions is enabled.
   */
  side = input<RadianPopperSide>(RadianPopperSide.Bottom);
  /** The distance in pixels from the anchor. */
  sideOffset = input(0, { transform: numberAttribute });
  /** The preferred alignment against the anchor. May change when collisions occur. */
  align = input<RadianPopperAlignment>(RadianPopperAlignment.Center);
  /** An offset in pixels from the `start` or `end` alignment options. */
  alignOffset = input(0, { transform: numberAttribute });
  /**
   * The padding between the arrow and the edges of the content.
   * If your content has border-radius, this will prevent it from overflowing the corners.
   */
  arrowPadding = input(0, { transform: numberAttribute });
  /** When `true`, overrides the `side` and `align` preferences to prevent collisions with boundary edges. */
  avoidCollisions = input(true, { transform: booleanAttribute });
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
    0,
  );
  /**
   * The sticky behavior on the `align` axis.
   * - `partial` will keep the content in the boundary as long as the trigger is at least partially in the boundary
   * - `always` will keep the content in the boundary regardless.
   */
  sticky = input<'partial' | 'always'>('partial');
  /** Whether to hide the content when the trigger becomes fully occluded. */
  hideWhenDetached = input(false, { transform: booleanAttribute });
  /** Whether to update the position of the floating element on every animation frame if required. */
  updatePositionStrategy = input<'optimized' | 'always'>('optimized');
  /** Emits when the element is placed. */
  placed = output<void>();

  arrow = contentChild(RadianPopperArrow);

  private injector = inject(Injector);
  private desiredPlacement = computed(
    () =>
      (this.side() +
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
      computePosition(
        this.context.anchor().elementRef.nativeElement,
        this.elementRef.nativeElement,
        {
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
        },
      ),
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
    if (!this.isBrowser) {
      return 0;
    }

    return getComputedStyle(this.contentElementRef().nativeElement).zIndex;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.position.reload();

      const cleanup = autoUpdate(
        this.context.anchor().elementRef.nativeElement,
        this.elementRef.nativeElement,
        () => this.position.reload(),
        {
          animationFrame: this.updatePositionStrategy() === 'always',
        },
      );

      destroyRef.onDestroy(cleanup);
    });
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

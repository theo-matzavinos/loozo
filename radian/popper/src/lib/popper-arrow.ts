import {
  computed,
  createComponent,
  Directive,
  effect,
  ElementRef,
  EnvironmentInjector,
  inject,
} from '@angular/core';
import { RadianArrow } from '@loozo/radian/arrow';
import { RadianPopperContentContext } from './popper-content-context';
import { RadianPopperSide } from './types';

@Directive({
  host: {
    '[style]': 'style()',
  },
})
export class RadianPopperArrow {
  protected popperContentContext = inject(RadianPopperContentContext);
  protected right = computed(() =>
    this.popperContentContext.placedSide() === RadianPopperSide.Left
      ? '0px'
      : '',
  );
  protected bottom = computed(() =>
    this.popperContentContext.placedSide() === RadianPopperSide.Top
      ? '0px'
      : '',
  );
  protected transformOrigin = computed(() => {
    switch (this.popperContentContext.placedSide()) {
      case RadianPopperSide.Bottom:
        return 'center 0';
      case RadianPopperSide.Left:
        return '100% 0';
      case RadianPopperSide.Right:
        return '0 0';
      case RadianPopperSide.Top:
        return '';
      default:
        return '';
    }
  });
  protected transform = computed(() => {
    switch (this.popperContentContext.placedSide()) {
      case RadianPopperSide.Bottom:
        return 'rotate(180deg)';
      case RadianPopperSide.Left:
        return 'translateY(50%) rotate(-90deg) translateX(50%)';
      case RadianPopperSide.Right:
        return 'translateY(50%) rotate(90deg) translateX(-50%)';
      case RadianPopperSide.Top:
        return 'translateY(100%)';
      default:
        return '';
    }
  });

  protected style = computed(() => ({
    display: 'block',
    position: 'absolute',
    left: this.popperContentContext.arrowX(),
    top: this.popperContentContext.arrowY(),
    right:
      this.popperContentContext.placedSide() === RadianPopperSide.Left ? 0 : '',
    bottom:
      this.popperContentContext.placedSide() === RadianPopperSide.Top ? 0 : '',
    transformOrigin: this.transformOrigin(),
    transform: this.transform(),
    visibility: this.popperContentContext.shouldHideArrow() ? 'hidden' : '',
  }));

  /** @internal */
  elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const environmentInjector = inject(EnvironmentInjector);

    effect((onCleanup) => {
      const component = createComponent(RadianArrow, {
        environmentInjector,
        hostElement: this.elementRef.nativeElement,
        projectableNodes: [
          Array.from(this.elementRef.nativeElement.childNodes),
        ],
      });

      onCleanup(() => component.destroy());
    });
  }
}

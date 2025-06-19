import {
  afterNextRender,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RadianCollapsibleContext } from './collapsible-context';
import { uniqueId } from '@loozo/radian/common';

@Directive({
  selector: '[radianCollapsibleContent]',
  host: {
    '[attr.id]': 'id()',
    '[attr.data-state]': 'context.state()',
    '[attr.data-disabled]': 'context.disabled() ? "" : null',
    '[attr.hidden]': '!context.open() || null',
    '[style]': 'style()',
  },
})
export class RadianCollapsibleContent {
  /** @internal */
  id = input(uniqueId('radian-collapsible-content'));

  protected context = inject(RadianCollapsibleContext);
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private originalStyles!: {
    transitionDuration: string;
    animationName: string;
  };
  private wasMountAnimationPrevented = false;
  private dimensions = computed(() => {
    this.context.open();
    // block any animations/transitions so the elementRef renders at its full dimensions
    this.elementRef.nativeElement.style.transitionDuration = '0s';
    this.elementRef.nativeElement.style.animationName = 'none';

    // get width and height from full dimensions
    const rect = this.elementRef.nativeElement.getBoundingClientRect();

    // kick off any animations/transitions that were originally set up if it isn't the initial mount
    if (this.wasMountAnimationPrevented) {
      this.elementRef.nativeElement.style.transitionDuration =
        this.originalStyles.transitionDuration;
      this.elementRef.nativeElement.style.animationName =
        this.originalStyles.animationName;
    }

    return rect;
  });

  protected style = computed(() => ({
    '--radian-collapsible-content-height': `${this.dimensions().height}px`,
    '--radian-collapsible-content-width': `${this.dimensions().width}px`,
  }));

  constructor() {
    afterNextRender(() => {
      this.originalStyles = {
        transitionDuration:
          this.elementRef.nativeElement.style.transitionDuration,
        animationName: this.elementRef.nativeElement.style.animationName,
      };

      requestAnimationFrame(() => {
        this.wasMountAnimationPrevented = true;
      });
    });
  }
}

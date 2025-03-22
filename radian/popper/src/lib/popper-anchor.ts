import { Directive, ElementRef, inject } from '@angular/core';

@Directive({})
export class RadianPopperAnchor {
  elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
}

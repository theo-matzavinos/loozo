import { Directive, ElementRef, inject } from '@angular/core';
import { provideRadianPopperAnchor } from './popper-anchor';

@Directive({
  providers: [
    provideRadianPopperAnchor(() => inject(ElementRef).nativeElement),
  ],
})
export class RadianPopperElementAnchor {}

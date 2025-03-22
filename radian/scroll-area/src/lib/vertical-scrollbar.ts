import {
  ComponentRef,
  createComponent,
  Directive,
  effect,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RadianScrollArea, RadianScrollAreaType } from './scroll-area';
import { RadianScrollbarHover } from './scrollbar-hover';
import { RadianOrientation } from '@loozo/radian/common';

@Directive({
  selector: '[radianVerticalScrollbar]',
})
export class RadianVerticalScrollbar {}

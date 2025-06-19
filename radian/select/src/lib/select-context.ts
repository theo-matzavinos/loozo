import {
  ElementRef,
  InjectionToken,
  Signal,
  WritableSignal,
} from '@angular/core';
import { Direction } from '@loozo/radian/common';

export type RadianSelectOption = {
  elementRef: ElementRef<HTMLElement>;
  value: Signal<string>;
  disabled: Signal<boolean>;
  textValue: Signal<string>;
  textElement: Signal<ElementRef<HTMLElement>>;
};

export interface RadianSelectSharedContext {
  trigger: Signal<ElementRef<HTMLButtonElement>>;
  contentId: string;
  open: Signal<boolean>;
  required: Signal<boolean>;
  setOpen(open: boolean): void;
  dir: Signal<Direction>;
  triggerPointerDownPos: WritableSignal<{ x: number; y: number } | undefined>;
  disabled: Signal<boolean>;
  options: Signal<RadianSelectOption[]>;
  addOption(option: RadianSelectOption): void;
  removeOption(option: RadianSelectOption): void;
  valueNode: Signal<ElementRef<HTMLElement>>;
}

export interface RadianSelectSingleContext extends RadianSelectSharedContext {
  multiple: false;
  value: Signal<string | undefined>;
  setValue(value: string): void;
}

export interface RadianSelectMultipleContext extends RadianSelectSharedContext {
  multiple: true;
  value: Signal<string[] | undefined>;
  toggle(value: string): void;
  setValue(value: string[]): void;
  add(value: string): void;
  remove(value: string): void;
}

export type RadianSelectContext =
  | RadianSelectSingleContext
  | RadianSelectMultipleContext;

export const RadianSelectContext = new InjectionToken<RadianSelectContext>(
  '[Radian] Select Context',
);

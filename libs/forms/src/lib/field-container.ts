import { InjectionToken, Signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';

export type LoozoFieldContainer = {
  id: Signal<string>;
  addField(name: string | number, control: AbstractControl): void;
  removeField(name: string | number): void;
  getInitialValue<U = unknown>(name: string | number): U | undefined;
};

export const LoozoFieldContainer = new InjectionToken<LoozoFieldContainer>(
  '[LoozoForm] Field Container',
);

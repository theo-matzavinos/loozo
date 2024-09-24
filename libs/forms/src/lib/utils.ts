import { Signal, Type, isSignal } from '@angular/core';

export type MaybeSignal<T> = T | Signal<T>;

export type Factory<T> = () => T;

export type MaybeFactoryOrType<T> = T | Factory<T> | Type<T>;

export function unwrapMaybeSignal<T>(value: MaybeSignal<T>) {
  return isSignal(value) ? value() : value;
}

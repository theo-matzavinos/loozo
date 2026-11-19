import type { InputSignalWithTransform, OutputEmitterRef } from "@angular/core";

/** Core's callback name for an output: `<key>ChangeRequest` and `<key>Change` both map to `on<Key>Change`. */
type CallbackName<K extends string> = K extends `${infer Key}ChangeRequest`
  ? `on${Capitalize<Key>}Change`
  : `on${Capitalize<K>}`;

/**
 * The core option or prop names a directive binds: its inputs under their own names (renamed
 * through `R`, like `{ uiSelectItem: "value" }`) and its outputs under their callbacks' names.
 * `touch` (Signal Forms' name) and a toolbar button's `press` are this package's own outputs, not
 * core callbacks, so they bind none.
 */
export type ɵBoundNames<D, R extends Record<string, string> = {}> = {
  [K in keyof D & string]: D[K] extends InputSignalWithTransform<any, any>
    ? K extends keyof R
      ? R[K]
      : K
    : D[K] extends OutputEmitterRef<any>
      ? K extends "touch" | "press"
        ? never
        : CallbackName<K>
      : never;
}[keyof D & string];

/** True when `A` and `B` are the same union of names. */
export type ɵSameNames<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Fails to compile unless its argument is `true`. */
export type ɵExpect<T extends true> = T;

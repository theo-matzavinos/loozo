import { InjectionToken, Signal, TemplateRef } from '@angular/core';
import { AsyncValidatorFn } from '@angular/forms';

export type LoozoAsyncValidator = {
  /** The `key` this validator adds to the field's `errors` object. */
  key: Signal<string>;
  /** The validator function to register. */
  validator: Signal<AsyncValidatorFn>;
  /** The message to display when this validator marks the field as invalid. */
  message: Signal<TemplateRef<void>>;
};

export const LoozoAsyncValidator = new InjectionToken<LoozoAsyncValidator>(
  '[LoozoForm] Async Validator',
);

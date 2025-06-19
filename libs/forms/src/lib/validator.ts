import { InjectionToken, Signal, TemplateRef } from '@angular/core';
import { ValidatorFn } from '@angular/forms';

export type LoozoValidator = {
  /** The `key` this validator adds to the field's `errors` object. */
  key: Signal<string>;
  /** The validator function to register. */
  validator: Signal<ValidatorFn>;
  /** The message to display when this validator marks the field as invalid. */
  message: Signal<TemplateRef<void>>;
};

export const LoozoValidator = new InjectionToken<LoozoValidator>(
  '[LoozoForm] Validator',
);

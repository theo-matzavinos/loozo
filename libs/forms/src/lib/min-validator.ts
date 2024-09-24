import { Directive, TemplateRef, computed, inject, input } from '@angular/core';
import { LoozoValidator } from './validator';
import { MaybeSignal } from './utils';
import { Validators } from '@angular/forms';

@Directive({
  selector: '[loozoMinValidator]',
  standalone: true,
  hostDirectives: [
    {
      directive: LoozoValidator,
      inputs: ['loozoValidatorMessage'],
    },
  ],
})
export class LoozoMinValidator {
  value = input.required<number>({ alias: 'loozoMinValidator' });

  private validator = inject(LoozoValidator, { self: true });

  constructor() {
    this.validator
      .setKey('min')
      .setValidator(computed(() => Validators.min(this.value())));
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.validator.setMessage(message);
  }
}

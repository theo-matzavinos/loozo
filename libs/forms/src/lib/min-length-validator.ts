import { Directive, TemplateRef, computed, inject, input } from '@angular/core';
import { LoozoValidator } from './validator';
import { MaybeSignal } from './utils';
import { Validators } from '@angular/forms';

@Directive({
  selector: '[loozoMinLengthValidator]',
  standalone: true,
  hostDirectives: [
    {
      directive: LoozoValidator,
      inputs: ['loozoValidatorMessage'],
    },
  ],
})
export class LoozoMinLengthValidator {
  value = input.required<number>({ alias: 'loozoMinLengthValidator' });

  private validator = inject(LoozoValidator, { self: true });

  constructor() {
    this.validator
      .setKey('minlength')
      .setValidator(computed(() => Validators.minLength(this.value())));
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.validator.setMessage(message);
  }
}

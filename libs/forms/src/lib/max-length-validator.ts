import { Directive, TemplateRef, computed, inject, input } from '@angular/core';
import { LoozoValidator } from './validator';
import { MaybeSignal } from './utils';
import { Validators } from '@angular/forms';

@Directive({
  selector: '[loozoMaxLengthValidator]',
  standalone: true,
  hostDirectives: [
    {
      directive: LoozoValidator,
      inputs: ['loozoValidatorMessage'],
    },
  ],
})
export class LoozoMaxLengthValidator {
  value = input.required<number>({ alias: 'loozoMaxLengthValidator' });

  private validator = inject(LoozoValidator, { self: true });

  constructor() {
    this.validator
      .setKey('maxlength')
      .setValidator(computed(() => Validators.maxLength(this.value())));
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.validator.setMessage(message);
  }
}

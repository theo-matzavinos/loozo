import { Directive, TemplateRef, computed, inject, input } from '@angular/core';
import { LoozoValidator } from './validator';
import { MaybeSignal } from './utils';
import { Validators } from '@angular/forms';

@Directive({
  selector: '[loozoMaxValidator]',
  standalone: true,
  hostDirectives: [
    {
      directive: LoozoValidator,
      inputs: ['loozoValidatorMessage'],
    },
  ],
})
export class LoozoMaxValidator {
  value = input.required<number>({ alias: 'loozoMaxValidator' });

  private validator = inject(LoozoValidator, { self: true });

  constructor() {
    this.validator
      .setKey('max')
      .setValidator(computed(() => Validators.max(this.value())));
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.validator.setMessage(message);
  }
}

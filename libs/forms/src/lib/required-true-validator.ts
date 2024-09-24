import { Directive, TemplateRef, inject } from '@angular/core';
import { LoozoValidator } from './validator';
import { MaybeSignal } from './utils';
import { Validators } from '@angular/forms';

@Directive({
  selector: '[loozoRequiredTrueValidator]',
  standalone: true,
  hostDirectives: [
    {
      directive: LoozoValidator,
      inputs: ['loozoValidatorMessage'],
    },
  ],
})
export class LoozoRequiredTrueValidator {
  private validator = inject(LoozoValidator, { self: true });

  constructor() {
    this.validator.setKey('required').setValidator(Validators.requiredTrue);
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.validator.setMessage(message);
  }
}

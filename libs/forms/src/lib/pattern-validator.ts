import { Directive, TemplateRef, computed, inject, input } from '@angular/core';
import { LoozoValidator } from './validator';
import { MaybeSignal } from './utils';
import { Validators } from '@angular/forms';

@Directive({
  selector: '[loozoPatternValidator]',
  standalone: true,
  hostDirectives: [
    {
      directive: LoozoValidator,
      inputs: ['loozoValidatorMessage'],
    },
  ],
})
export class LoozoPatternValidator {
  value = input.required<string | RegExp>({ alias: 'loozoPatternValidator' });

  private validator = inject(LoozoValidator, { self: true });

  constructor() {
    this.validator
      .setKey('pattern')
      .setValidator(computed(() => Validators.pattern(this.value())));
  }

  setMessage(message: MaybeSignal<TemplateRef<void>>) {
    this.validator.setMessage(message);
  }
}

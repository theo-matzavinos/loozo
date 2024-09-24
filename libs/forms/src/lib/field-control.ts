import { Directive, inject } from '@angular/core';

import { DefaultValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LoozoAbstractField } from './abstract-field';

@Directive({
  selector: '[loozoFieldControl]',
  standalone: true,
  host: {
    '[id]': 'field.id()',
  },
})
export class LoozoFieldControl {
  protected field = inject(LoozoAbstractField);
}

@Directive({
  selector:
    'input[loozoFieldControl],textarea[loozoFieldControl],select[loozoFieldControl]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: LoozoNativeInput,
      multi: true,
    },
  ],
  host: {
    '(input)': '$any(this)._handleInput($event.target.value)',
    '(blur)': 'onTouched()',
    '(compositionstart)': '$any(this)._compositionStart()',
    '(compositionend)': '$any(this)._compositionEnd($event.target.value)',
  },
})
export class LoozoNativeInput extends DefaultValueAccessor {}

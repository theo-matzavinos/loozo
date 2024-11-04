import { computed, Directive, inject, input } from '@angular/core';
import { LoozoForm } from '@loozo/forms';
import { ClassValue } from 'clsx';
import { mergeClasses } from '../merge-classes';

@Directive({
  selector: 'form[appForm]',
  exportAs: 'appForm',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
  hostDirectives: [
    {
      directive: LoozoForm,
      inputs: ['id', 'initialValue'],
      outputs: [
        'loozoSubmit:formSubmit',
        'loozoSubmit.valid:formSubmit.valid',
        'loozoSubmit.invalid:formSubmit.invalid',
        'loozoReset:formReset',
        'valueChange',
        'statusChange',
        'controlEvent',
      ],
    },
  ],
})
export class Form<T> {
  initialValue = input<T>();
  class = input<ClassValue>();

  api = inject<LoozoForm<T>>(LoozoForm);

  protected computedClass = computed(() =>
    mergeClasses('flex flex-col gap-4', this.class()),
  );
}

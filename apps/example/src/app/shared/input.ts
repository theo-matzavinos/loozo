import { computed, Directive, inject, input } from '@angular/core';
import { DefaultValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { mergeClasses } from './merge-classes';
import { ClassValue } from 'clsx';
import { LoozoField } from '@loozo/forms';

const inputClasses = [
  'flex',
  'h-10',
  'w-full',
  'rounded-md',
  'border',
  'border-input',
  'bg-background',
  'px-3',
  'py-2',
  'text-sm',
  'ring-offset-background',
  'file:border-0',
  'file:bg-transparent',
  'file:text-sm',
  'file:font-medium',
  'file:text-foreground',
  'placeholder:text-muted-foreground',
  'focus-visible:outline-none',
  'focus-visible:ring-2',
  'focus-visible:ring-ring',
  'focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed',
  'disabled:opacity-50',
  'group-data-[touched]/field:group-data-[invalid]/field:text-destructive',
  'group-data-[touched]/field:group-data-[invalid]/field:border-destructive',
  'group-data-[touched]/field:group-data-[invalid]/field:placeholder-destructive',
];

/**
 * Base classes for inputs.
 * Also adds a default `NG_VALUE_ACCESSOR` so `inputs` can be used in forms.
 * */
@Directive({
  selector: '[appInput]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: Input,
      multi: true,
    },
  ],
  host: {
    '[id]': 'computedId()',
    '[class]': 'computedClass()',
    '(input)': '$any(this)._handleInput($event.target.value)',
    '(blur)': 'onTouched()',
    '(compositionstart)': '$any(this)._compositionStart()',
    '(compositionend)': '$any(this)._compositionEnd($event.target.value)',
  },
})
export class Input extends DefaultValueAccessor {
  /** @internal */
  id = input();
  /** @internal */
  class = input<ClassValue>();

  private field = inject(LoozoField, { optional: true, host: true });
  protected computedId = computed(
    () => this.field?.controlId() ?? this.id() ?? null,
  );

  protected computedClass = computed(() =>
    mergeClasses(inputClasses, this.class()),
  );
}

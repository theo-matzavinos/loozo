import { computed, Directive, input } from '@angular/core';
import { ClassValue } from 'clsx';
import { mergeClasses } from './merge-classes';

@Directive({
  selector: '[appLabel]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
})
export class Label {
  class = input<ClassValue>();
  computedClass = computed(() =>
    mergeClasses(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      this.class(),
    ),
  );
}

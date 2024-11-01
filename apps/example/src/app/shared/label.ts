import { computed, Directive, input } from '@angular/core';
import { mergeClasses } from './merge-classes';
import { ClassValue } from 'clsx';

const labelClasses = [
  'text-sm',
  'font-medium',
  'leading-none',
  'peer-disabled:cursor-not-allowed',
  'peer-disabled:opacity-70',
  'group-focus-within/field:text-sm',
  'group-focus-within/field:top-2',
  'group-focus-within/field:text-primary',
  'group-focus-within/field:z-0',
  'group-focus-within/field:cursor-auto',
  'group-focus-within/field:pointer-events-auto',
  'group-data-[filled]/field:text-sm',
  'group-data-[filled]/field:top-2',
  'group-data-[filled]/field:z-0',
  'group-data-[filled]/field:cursor-auto',
  'group-data-[filled]/field:pointer-events-auto',
  'group-data-[touched]/field:group-data-[invalid]/field:text-destructive',
];

/** Base classes for input labels. */
@Directive({
  selector: '[appLabel]',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
})
export class Label {
  /** @internal */
  class = input<ClassValue>();

  protected computedClass = computed(() =>
    mergeClasses(labelClasses, this.class()),
  );
}

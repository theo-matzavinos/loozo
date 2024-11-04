import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  input,
  output,
} from '@angular/core';
import { LoozoFieldArrayItem } from '@loozo/forms';
import { ClassValue } from 'clsx';
import { mergeClasses } from '../merge-classes';
import { Button } from '../button';

@Component({
  selector: 'app-field-array-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'computedClass()',
  },
  imports: [Button],
  template: `
    <button
      class="ml-auto"
      type="button"
      appBtn
      variant="destructive"
      size="sm"
      (click)="remove.emit()"
    >
      Remove
    </button>
    <ng-content />
  `,
})
export class FieldArrayItem {
  class = input<ClassValue>();

  remove = output<void>();

  protected computedClass = computed(() =>
    mergeClasses('flex flex-col gap-4 rounded-lg border border-border p-6'),
  );
}

@Directive({
  selector: '[appFieldArrayItem]',
  standalone: true,
  hostDirectives: [LoozoFieldArrayItem],
})
export class FieldArrayItemTemplate {}

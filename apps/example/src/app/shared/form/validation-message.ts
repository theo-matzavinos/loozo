import { computed, Component, input } from '@angular/core';
import { ClassValue } from 'clsx';
import { mergeClasses } from '../merge-classes';

/** Component that renders a validation message. */
@Component({
  selector: 'app-validation-message',
  standalone: true,
  host: {
    '[class]': 'computedClass()',
  },
  template: `<ng-content />`,
})
export class ValidationMessage {
  /** @internal */
  class = input<ClassValue>();

  protected computedClass = computed(() =>
    mergeClasses(
      'absolute bottom-0 left-0 text-destructive text-sm truncate',
      this.class(),
    ),
  );
}

import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  input,
  numberAttribute,
  viewChild,
} from '@angular/core';
import { Validators } from '@angular/forms';
import { ValidationMessage } from './validation-message';
import { ClassValue } from 'clsx';
import { LoozoValidator } from '@loozo/forms';

/** Component that registers a max value validator. */
@Component({
  selector: 'app-max-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: LoozoValidator,
      useExisting: MaxValidator,
    },
  ],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content>
          The maximum value of this field is {{ value() }}.
        </ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class MaxValidator implements LoozoValidator {
  /** The max allowed value. */
  value = input.required({ transform: numberAttribute });
  /** @internal */
  key = computed(() => 'max');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.max(this.value()));
  /** @internal */
  class = input<ClassValue>();
}

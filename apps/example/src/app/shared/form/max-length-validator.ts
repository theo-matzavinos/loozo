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

/** Component that registers a max-length validator. */
@Component({
  selector: 'app-max-length-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: LoozoValidator,
      useExisting: MaxLengthValidator,
    },
  ],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content>
          The maximum length of this field is {{ value() }}.
        </ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class MaxLengthValidator implements LoozoValidator {
  /** Max length value. */
  value = input.required({ transform: numberAttribute });
  /** @internal */
  key = computed(() => 'maxlength');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.maxLength(this.value()));
  /** @internal */
  class = input<ClassValue>();
}

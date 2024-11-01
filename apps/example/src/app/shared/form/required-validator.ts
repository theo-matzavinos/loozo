import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { Validators } from '@angular/forms';
import { ValidationMessage } from './validation-message';
import { ClassValue } from 'clsx';
import { LoozoValidator } from '@loozo/forms';

/** Component that registers a required validator. */
@Component({
  selector: 'app-required-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: LoozoValidator,
      useExisting: RequiredValidator,
    },
  ],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content> This field is required. </ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class RequiredValidator implements LoozoValidator {
  /** @internal */
  key = computed(() => 'required');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.required);
  /** @internal */
  class = input<ClassValue>();
}

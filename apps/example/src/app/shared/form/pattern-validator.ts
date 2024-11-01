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

/** Component that registers a pattern validator. */
@Component({
  selector: 'app-pattern-validator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: LoozoValidator,
      useExisting: PatternValidator,
    },
  ],
  imports: [ValidationMessage],
  template: `
    <ng-template>
      <app-validation-message [class]="class()">
        <ng-content>
          A DEFAULT MESSAGE FOR THIS VALIDATOR WOULD MAKE NO SENSE!!!
        </ng-content>
      </app-validation-message>
    </ng-template>
  `,
})
export class PatternValidator implements LoozoValidator {
  /** The regex to use to validate the value. */
  value = input.required<string | RegExp>();
  /** @internal */
  key = computed(() => 'pattern');
  /** @internal */
  message = viewChild.required(TemplateRef);
  /** @internal */
  validator = computed(() => Validators.pattern(this.value()));
  /** @internal */
  class = input<ClassValue>();
}

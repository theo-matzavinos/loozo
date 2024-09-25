import {
  booleanAttribute,
  computed,
  contentChildren,
  Directive,
  effect,
  inject,
  input,
  TemplateRef,
  untracked,
} from '@angular/core';
import { outputFromObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl } from '@angular/forms';
import { controlValue } from './control-value';
import { map } from 'rxjs';
import { LoozoValidator } from './validator';
import { LoozoAsyncValidator } from './async-validator';

@Directive({
  standalone: true,
  host: {
    '[attr.data-valid]': 'valid() ? "" : null',
    '[attr.data-invalid]': 'invalid() ? "" : null',
    '[attr.data-pending]': 'pending() ? "" : null',
    '[attr.data-disabled]': 'disabled() ? "" : null',
    '[attr.data-enabled]': 'enabled() ? "" : null',
    '[attr.data-pristine]': 'pristine() ? "" : null',
    '[attr.data-dirty]': 'dirty() ? "" : null',
    '[attr.data-touched]': 'touched() ? "" : null',
    '[attr.data-untouched]': 'untouched() ? "" : null',
    '[attr.data-status]': 'status()',
  },
})
export abstract class LoozoAbstractControlContainer<T = unknown> {
  disabled = input(false, { transform: booleanAttribute });
  // type = input<T>();
  protected abstract type: T;

  protected abstractControl = inject<AbstractControl<T>>(AbstractControl, {
    self: true,
  });

  valueChange = outputFromObservable(this.abstractControl.valueChanges);
  statusChange = outputFromObservable(this.abstractControl.statusChanges);
  controlEvent = outputFromObservable(this.abstractControl.events);
  value = controlValue<T | undefined>(this.abstractControl);
  valid = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.valid)),
  );
  invalid = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.invalid)),
  );
  pending = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.pending)),
  );
  enabled = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.enabled)),
  );
  errors = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.errors)),
  );
  pristine = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.pristine)),
  );
  dirty = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.dirty)),
  );
  touched = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.touched)),
  );
  untouched = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.untouched)),
  );
  status = toSignal(
    this.abstractControl.events.pipe(map(({ source }) => source.status)),
  );
  private validators = contentChildren(LoozoValidator);
  private asyncValidators = contentChildren(LoozoAsyncValidator);

  validationMessages = computed(() => {
    const errors = this.errors();
    const result: TemplateRef<void>[] = [];

    if (!errors) {
      return result;
    }

    for (const key in errors) {
      const validator =
        this.validators().find((v) => v.key() === key) ??
        this.asyncValidators().find((v) => v.key() === key);

      if (validator?.message()) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        result.push(validator.message()!);
      }
    }

    return result;
  });

  constructor() {
    effect(() => {
      const disabled = this.disabled();

      untracked(() => {
        if (disabled) {
          this.abstractControl.disable();
        } else {
          this.abstractControl.enable();
        }
      });
    });
  }
}

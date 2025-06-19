import {
  computed,
  contentChildren,
  Directive,
  effect,
  inject,
  IterableDiffers,
  Signal,
  TemplateRef,
} from '@angular/core';
import { outputFromObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  AsyncValidatorFn,
  FormControl,
  ValidatorFn,
} from '@angular/forms';
import { map } from 'rxjs';
import { LoozoValidator } from './validator';
import { LoozoAsyncValidator } from './async-validator';

/** Base class for all components that contain `AbstractControl`s. */
@Directive({

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
    '[attr.data-filled]': 'filled() ? "" : null',
    '[attr.data-empty]': 'empty() ? "" : null',
  },
})
export abstract class LoozoAbstractControlContainer<T = unknown> {
  protected abstractControl = inject<AbstractControl<T>>(AbstractControl, {
    self: true,
  });

  /** Emits when the control's value changes. */
  valueChange = outputFromObservable(this.abstractControl.valueChanges);
  /** Emits when the control's status changes. */
  statusChange = outputFromObservable(this.abstractControl.statusChanges);
  /** Emits all control events. */
  controlEvent = outputFromObservable(this.abstractControl.events);
  /** Current value of the control. */
  value = controlValue<T | undefined>(this.abstractControl);
  /** Whether the control is valid. */
  valid = controlState(this.abstractControl, 'valid');
  /** Whether the control is invalid. */
  invalid = controlState(this.abstractControl, 'invalid');
  /** Whether the control has a pending `AsyncValidator`. */
  pending = controlState(this.abstractControl, 'pending');
  /** Whether this control is disabled. */
  disabled = controlState(this.abstractControl, 'disabled');
  /** Whether the control is enabled. */
  enabled = controlState(this.abstractControl, 'enabled');
  /** An object with the validation errors of this control or null if the control is valid. */
  errors = controlState(this.abstractControl, 'errors');
  /** Whether the control is pristine. */
  pristine = controlState(this.abstractControl, 'pristine');
  /** Whether the control is dirty. */
  dirty = controlState(this.abstractControl, 'dirty');
  /** Whether the control is touched. */
  touched = controlState(this.abstractControl, 'touched');
  /** Whether the control is untouched. */
  untouched = controlState(this.abstractControl, 'untouched');
  /** The control's current status. */
  status = controlState(this.abstractControl, 'status');
  /** Whether the control has a value. */
  filled = computed(() => this.value() != undefined && this.value() !== '');
  /** Whether the control has no value. */
  empty = computed(() => !this.filled());
  private validators = contentChildren(LoozoValidator);
  private asyncValidators = contentChildren(LoozoAsyncValidator);

  /** Array of `TemplateRef`s for the validation messages of this control. */
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
    const validatorFns = computed(() =>
      this.validators().map((v) => v.validator()),
    );
    const asyncValidatorFns = computed(() =>
      this.asyncValidators().map((v) => v.validator()),
    );
    const iterableDifferFactory = inject(IterableDiffers).find([]);
    const validatorsDiffer = iterableDifferFactory.create<ValidatorFn>();
    const asyncValidatorsDiffer =
      iterableDifferFactory.create<AsyncValidatorFn>();

    effect(() => {
      const changes = validatorsDiffer.diff(validatorFns());

      changes?.forEachAddedItem((v) =>
        this.abstractControl.addValidators(v.item),
      );
      changes?.forEachRemovedItem((v) =>
        this.abstractControl.removeValidators(v.item),
      );
    });

    effect(() => {
      const changes = asyncValidatorsDiffer.diff(asyncValidatorFns());

      changes?.forEachAddedItem((v) =>
        this.abstractControl.addAsyncValidators(v.item),
      );
      changes?.forEachRemovedItem((v) =>
        this.abstractControl.removeAsyncValidators(v.item),
      );
    });
  }

  /** Marks the control as touched. */
  markAsTouched(...args: Parameters<AbstractControl['markAsTouched']>) {
    this.abstractControl.markAsTouched(...args);
  }

  /** Marks the control and all its descendant controls as touched. */
  markAllAsTouched(...args: Parameters<AbstractControl['markAllAsTouched']>) {
    this.abstractControl.markAllAsTouched(...args);
  }

  /** Marks the control as untouched. */
  markAsUntouched(...args: Parameters<AbstractControl['markAsUntouched']>) {
    this.abstractControl.markAsUntouched(...args);
  }

  /** Marks the control as dirty. */
  markAsDirty(...args: Parameters<AbstractControl['markAsDirty']>) {
    this.abstractControl.markAsDirty(...args);
  }

  /** Marks the control as pristine. */
  markAsPristine(...args: Parameters<AbstractControl['markAsPristine']>) {
    this.abstractControl.markAsPristine(...args);
  }

  /** Marks the control as pending. */
  markAsPending(...args: Parameters<AbstractControl['markAsPending']>) {
    this.abstractControl.markAsPending(...args);
  }

  /**
   * Recalculates the value and validation status of the control.
   * By default, it also updates the value and validity of its ancestors.
   */
  updateValueAndValidity(
    ...args: Parameters<AbstractControl['updateValueAndValidity']>
  ) {
    this.abstractControl.updateValueAndValidity(...args);
  }
}

function controlState<K extends keyof AbstractControl>(
  control: AbstractControl,
  key: K,
): Signal<AbstractControl[K]> {
  return toSignal(control.events.pipe(map(({ source }) => source[key])), {
    initialValue: control[key],
  });
}

function controlValue<U>(
  formControl: Pick<FormControl<U>, 'value' | 'valueChanges'>,
) {
  return toSignal(formControl.valueChanges, {
    initialValue: formControl.value,
  });
}

import {
  Directive,
  booleanAttribute,
  untracked,
  input,
  output,
  linkedSignal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

/** Directive used to register an `NG_VALUE_ACCESSOR`. */
@Directive({
  exportAs: 'radianControlValueAccessor',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: RadianControlValueAccessor,
      multi: true,
    },
  ],
})
export class RadianControlValueAccessor<T> {
  /** Value of this control. */
  valueInput = input<T>(undefined, { alias: 'value' });
  /** Whether this control is disabled. */
  disabledInput = input(false, {
    alias: 'disabled',
    transform: booleanAttribute,
  });
  /** Emits when the value of this control changes. */
  valueChange = output<T>();

  private _value = linkedSignal(() => this.valueInput());
  /** Current value of this control. */
  value = this._value.asReadonly();

  private _disabled = linkedSignal(() => this.disabledInput());
  /** Current disabled status of this control. */
  disabled = this._disabled.asReadonly();

  private onChange?: (value: T | undefined) => void;
  private onTouched?: () => void;

  protected writeValue(value: T | undefined): void {
    untracked(() => this._value.set(value as T));
  }

  protected registerOnChange(fn: (value: T | undefined) => void): void {
    this.onChange = fn;
  }

  protected registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  /** @internal */
  setDisabledState(isDisabled: boolean): void {
    this._disabled.set(isDisabled);
  }

  /** Update this control's value. */
  setValue(value: T) {
    this._value.set(value);
    this.valueChange.emit(value);
    this.onChange?.(value);
  }

  /** @internal */
  markAsTouched() {
    this.onTouched?.();
  }
}

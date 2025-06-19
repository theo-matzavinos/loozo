import {
  computed,
  Directive,
  effect,
  inject,
  input,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { LoozoFieldContainer } from './field-container';
import { LoozoAbstractControlContainer } from './abstract-control-container';

/** Base class for components that map to a field of a form's value. */
@Directive({

})
export abstract class LoozoAbstractField<
  T = unknown,
> extends LoozoAbstractControlContainer {
  /** Name of the field */
  _name = input.required<string | number>();

  protected override abstractControl = inject<AbstractControl<T>>(
    AbstractControl,
    {
      self: true,
    },
  );

  private parent = inject(LoozoFieldContainer, {
    skipSelf: true,
  });
  /** @internal */
  id: Signal<string> = computed(() => {
    if (!this.parent) {
      return `${this._name()}`;
    }

    return `${this.parent.id()}-${this._name()}`;
  });
  /** @internal */
  labelId = computed(() => `${this.id()}-label`);
  /** @internal */
  controlId = computed(() => `${this.id()}-control`);

  protected _initialValue = computed(() =>
    signal<T | undefined>(this.parent.getInitialValue(this._name())),
  );
  /** @internal */
  initialValue = computed(() => this._initialValue()());

  constructor() {
    super();

    effect((onCleanup) => {
      const name = this._name();

      untracked(() => {
        this.parent.addField(name, this.abstractControl);
      });

      onCleanup(() => this.parent.removeField(name));
    });
  }
}

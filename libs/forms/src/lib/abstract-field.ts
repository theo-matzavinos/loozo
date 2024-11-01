import {
  afterNextRender,
  computed,
  Directive,
  effect,
  inject,
  Injector,
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
  standalone: true,
})
export abstract class LoozoAbstractField<
  T = unknown,
> extends LoozoAbstractControlContainer {
  /** Name of the field */
  name = input.required<string | number>();

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
      return `${this.name()}`;
    }

    return `${this.parent.id()}-${this.name()}`;
  });
  /** @internal */
  labelId = computed(() => `${this.id()}-label`);
  /** @internal */
  controlId = computed(() => `${this.id()}-control`);

  protected _initialValue = signal<T | undefined>(undefined);
  /** @internal */
  initialValue = this._initialValue.asReadonly();

  constructor() {
    super();
    const injector = inject(Injector);

    afterNextRender(() => {
      // WARNING!! HERE BE DRAGONS!
      this._initialValue.set(this.parent.getInitialValue<T>(this.name()));

      effect(
        (onCleanup) => {
          const name = this.name();

          untracked(() => {
            this.parent.addField(name, this.abstractControl);
          });

          onCleanup(() => this.parent.removeField(name));
        },
        { injector },
      );
    });
  }
}

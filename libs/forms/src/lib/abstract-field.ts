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

@Directive({
  standalone: true,
})
export abstract class LoozoAbstractField<
  T = unknown,
> extends LoozoAbstractControlContainer {
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
  id: Signal<string> = computed(() => {
    if (!this.parent) {
      return `${this.name()}`;
    }

    return `${this.parent.id()}-${this.name()}`;
  });
  private initialValueHack = signal<() => T | undefined>(() => undefined as T);
  initialValue = computed(() => this.initialValueHack()());

  constructor() {
    super();
    const injector = inject(Injector);

    afterNextRender(() => {
      this.initialValueHack.set(() =>
        this.parent.getInitialValue<T>(this.name()),
      );

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

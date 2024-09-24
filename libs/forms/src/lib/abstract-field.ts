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

@Directive({
  standalone: true,
})
export class LoozoAbstractField<T = unknown> {
  name = input.required<string | number>();

  private abstractControl = inject<AbstractControl<T>>(AbstractControl, {
    self: true,
  });

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

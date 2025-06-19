import {
  contentChild,
  Directive,
  effect,
  EmbeddedViewRef,
  inject,
  input,
  numberAttribute,
  untracked,
} from '@angular/core';
import {
  LoozoFieldArrayItemContext,
  LoozoArrayFieldItemFactory,
} from './field-array-item';
import { AbstractControl, FormArray } from '@angular/forms';
import { LoozoForm } from './form';
import { LoozoAbstractField } from './abstract-field';
import { LoozoFieldContainer } from './field-container';
import { LoozoAbstractControlContainer } from './abstract-control-container';

/** Directive used to define a field that has an array value. */
@Directive({
  selector: '[loozoFieldArray]',

  exportAs: 'loozoFieldArray',
  providers: [
    { provide: AbstractControl, useFactory: () => new FormArray([]) },
    { provide: LoozoAbstractControlContainer, useExisting: LoozoFieldArray },
    { provide: LoozoAbstractField, useExisting: LoozoFieldArray },
    {
      provide: LoozoFieldContainer,
      useFactory: () => {
        const formArray = inject(AbstractControl, { self: true }) as FormArray;
        const field = inject(LoozoAbstractField, { self: true });

        return {
          id: field.id,
          addField(name, control) {
            const index = numberAttribute(name);

            if (isNaN(index)) {
              throw new Error(`Invalid index value: '${name}'.`);
            }

            formArray.insert(index, control);
          },
          removeField(name) {
            const index = numberAttribute(name);

            if (isNaN(index)) {
              throw new Error(`Invalid index value: '${name}'.`);
            }

            formArray.removeAt(index);
          },
          getInitialValue(name) {
            return field.initialValue()?.[name];
          },
        } as LoozoFieldContainer;
      },
    },
  ],
})
export class LoozoFieldArray<T> extends LoozoAbstractField<T[]> {
  /** The name of the field. */
  override _name = input.required<string | number>({
    alias: 'loozoFieldArray',
  });
  /** The type of this field's items' value (optional). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemType = input<T>(undefined as any, { alias: 'loozoFieldArrayType' });

  private formArray = inject(AbstractControl, { self: true }) as FormArray;

  private fieldArrayItemFactory = contentChild.required(
    LoozoArrayFieldItemFactory,
  );
  private renderedItems = new Set<
    EmbeddedViewRef<LoozoFieldArrayItemContext>
  >();
  private nextItemId = 0;

  constructor() {
    super();
    const form = inject(LoozoForm);

    effect(() => {
      const initialValue = this.initialValue();

      if (this.formArray.dirty) {
        return;
      }

      untracked(() => this.resetItems(initialValue?.length));
    });

    form.resetted.subscribe(() => {
      this.resetItems(this.initialValue()?.length);
    });
  }

  /** Adds an empty item to the array. */
  addItem() {
    const index = this.nextItemId++;
    const viewRef = this.fieldArrayItemFactory()(index);

    this.renderedItems.add(viewRef);

    viewRef.onDestroy(() => {
      this.renderedItems.delete(viewRef);
    });
  }

  setValue(value: T[]) {
    this.resetItems(value.length);
    this._initialValue().set(value);
  }

  private resetItems(targetCount = 0) {
    for (const item of this.renderedItems) {
      item.destroy();
    }

    this.renderedItems.clear();
    this.nextItemId = 0;

    for (let i = 0; i < targetCount; i++) {
      this.addItem();
    }
  }
}

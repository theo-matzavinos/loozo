import {
  contentChild,
  Directive,
  effect,
  EmbeddedViewRef,
  inject,
  numberAttribute,
  untracked,
} from '@angular/core';
import {
  LoozoFieldArrayItemContext,
  LoozoArrayFieldItemFactory,
} from './field-array-item';
import { AbstractControl, FormArray } from '@angular/forms';
import { LoozoForm } from './form';
import { LoozoAbstractControlContainer } from './abstract-control-container';
import { LoozoAbstractField } from './abstract-field';
import { LoozoFieldContainer } from './field-container';

@Directive({
  selector: '[loozoFieldArray]',
  standalone: true,
  exportAs: 'loozoFieldArray',
  providers: [
    { provide: AbstractControl, useFactory: () => new FormArray([]) },
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
  hostDirectives: [
    {
      directive: LoozoAbstractControlContainer,
      inputs: ['type:loozoFieldArrayType', 'disabled'],
    },
    {
      directive: LoozoAbstractField,
      inputs: ['name:loozoFieldArray'],
    },
  ],
})
export class LoozoFieldArray {
  private formArray = inject(AbstractControl, { self: true }) as FormArray;
  config = inject<LoozoAbstractField<unknown[]>>(LoozoAbstractField, {
    self: true,
  });

  private fieldArrayItemFactory = contentChild.required(
    LoozoArrayFieldItemFactory,
  );
  private renderedItems = new Set<
    EmbeddedViewRef<LoozoFieldArrayItemContext>
  >();
  private nextItemId = 0;

  constructor() {
    const form = inject(LoozoForm);

    effect(() => {
      const initialValue = this.config.initialValue();

      if (this.formArray.dirty) {
        return;
      }

      untracked(() => this.resetItems(initialValue?.length));
    });

    form.resetted.subscribe(() => {
      this.resetItems(this.config.initialValue()?.length);
    });
  }

  addItem() {
    const index = this.nextItemId++;
    const viewRef = this.fieldArrayItemFactory()(index);

    this.renderedItems.add(viewRef);

    viewRef.onDestroy(() => {
      this.renderedItems.delete(viewRef);
    });
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

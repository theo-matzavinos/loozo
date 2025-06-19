import {
  Directive,
  inject,
  TemplateRef,
  InjectionToken,
  ViewContainerRef,
  EmbeddedViewRef,
} from '@angular/core';

export const LoozoArrayFieldItemFactory = new InjectionToken<
  (index: number) => EmbeddedViewRef<LoozoFieldArrayItemContext>
>('[LoozoForm] Array Field Item Factory');

export type LoozoFieldArrayItemContext = {
  $implicit: number;
  remove: () => void;
};

/** Structural directive used to define the template of a `FieldArray`'s items. */
@Directive({
  selector: '[loozoFieldArrayItem]',
  exportAs: 'loozoFieldArrayItem',

  providers: [
    {
      provide: LoozoArrayFieldItemFactory,
      useFactory: () => {
        const viewContainerRef = inject(ViewContainerRef, { self: true });
        const templateRef = inject<TemplateRef<LoozoFieldArrayItemContext>>(
          TemplateRef,
          { self: true },
        );

        return (index: number) => {
          const viewRef = viewContainerRef.createEmbeddedView(templateRef, {
            $implicit: index,
            remove: () => {
              viewRef.destroy();
            },
          });

          return viewRef;
        };
      },
    },
  ],
})
export class LoozoFieldArrayItem {
  /** @internal */
  template = inject<TemplateRef<LoozoFieldArrayItemContext>>(TemplateRef, {
    self: true,
  });
}

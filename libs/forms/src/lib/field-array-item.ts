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

@Directive({
  selector: '[loozoFieldArrayItem]',
  standalone: true,
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
  template = inject<TemplateRef<LoozoFieldArrayItemContext>>(TemplateRef, {
    self: true,
  });
}

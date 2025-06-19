import {
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  TemplateRef,
} from '@angular/core';
import { RadianSelectContext } from './select-context';

@Directive({
  selector: '[radianSelectMutltipleValue]',
})
export class RadianSelectMultipleValue {
  placeholder = input<string>();

  private templateRef = contentChild.required<
    RadianSelectMutltipleValueTemplate,
    TemplateRef<{ $implicit: string }>
  >(RadianSelectMutltipleValueTemplate, { read: TemplateRef });

  constructor() {
    const context = inject(RadianSelectContext);
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    effect((onCleanup) => {
      const value = context.value() as string[] | undefined;

      if (!value?.length) {
        elementRef.nativeElement.textContent = this.placeholder() ?? '';

        return;
      }

      const options = context
        .options()
        .filter((o) => value?.includes(o.value()));
      const templateRef = this.templateRef();

      for (const option of options) {
        const viewRef = templateRef.createEmbeddedView({
          $implicit: option.value(),
        });

        for (const node of viewRef.rootNodes) {
          elementRef.nativeElement.appendChild(node);
        }

        onCleanup(() => viewRef.destroy());
      }
    });
  }
}

@Directive({
  selector: '[radianSelectMutltipleValueTemplate]',
})
export class RadianSelectMutltipleValueTemplate {
  static ngTemplateContextGuard(
    _dir: RadianSelectMutltipleValueTemplate,
    ctx: unknown,
  ): ctx is { $implicit: string } {
    return true;
  }
}

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
  selector: '[radianSelectSingleValue]',
})
export class RadianSelectSingleValue {
  placeholder = input<string>();

  private templateRef = contentChild<
    RadianSelectSingleValueTemplate,
    TemplateRef<{ $implicit: string }>
  >(RadianSelectSingleValueTemplate, { read: TemplateRef });

  constructor() {
    const context = inject(RadianSelectContext);
    const elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    effect((onCleanup) => {
      const value = context.value() as string | undefined;

      if (!value) {
        elementRef.nativeElement.textContent = this.placeholder() ?? '';

        return;
      }

      const option = context.options().find((o) => o.value() === value);
      const templateRef = this.templateRef();

      if (!templateRef) {
        elementRef.nativeElement.textContent = option?.textValue() ?? '';

        return;
      }

      const viewRef = templateRef.createEmbeddedView({
        $implicit: value,
      });

      for (const node of viewRef.rootNodes) {
        elementRef.nativeElement.appendChild(node);
      }

      onCleanup(() => viewRef.destroy());
    });
  }
}

@Directive({
  selector: '[radianSelectSingleValueTemplate]',
})
export class RadianSelectSingleValueTemplate {
  static ngTemplateContextGuard(
    _dir: RadianSelectSingleValueTemplate,
    ctx: unknown,
  ): ctx is { $implicit: string } {
    return true;
  }
}

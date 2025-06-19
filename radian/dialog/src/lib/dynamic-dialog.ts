import {
  ComponentRef,
  computed,
  createComponent,
  DestroyRef,
  effect,
  EnvironmentInjector,
  inject,
  Injector,
  signal,
  Type,
} from '@angular/core';
import { RadianDialogContext } from './dialog-context';
import { uniqueId } from '@loozo/radian/common';

export function injectRadianDialog<C>({
  content,
  modal,
}: {
  content: Type<C>;
  modal: boolean;
}) {
  const id = uniqueId('radian-dialog');
  const isOpen = signal(false);
  const context = {
    trigger: computed(() => undefined),
    content: computed(() => undefined),
    contentId: `${id}-content`,
    titleId: `${id}-title`,
    descriptionId: `${id}-description`,
    open: isOpen.asReadonly(),
    setOpen(open: boolean) {
      isOpen.set(open);
    },
    toggle() {
      isOpen.update((v) => !v);
    },
    modal: computed(() => modal),
    state: computed(() => (isOpen() ? 'open' : 'closed')),
  };
  const environmentInjector = inject(EnvironmentInjector);
  const parentInjector = inject(Injector);
  let componentRef: ComponentRef<unknown> | undefined;

  inject(DestroyRef).onDestroy(() => componentRef?.destroy());

  effect(() => {
    if (!isOpen()) {
      componentRef?.destroy();
    }
  });

  return {
    open() {
      const elementInjector = Injector.create({
        providers: [{ provide: RadianDialogContext, useValue: context }],
        parent: parentInjector,
      });
      componentRef = createComponent(content, {
        environmentInjector,
        elementInjector,
      });
      isOpen.set(true);

      componentRef.onDestroy(() => isOpen.set(false));

      return componentRef;
    },
  };
}

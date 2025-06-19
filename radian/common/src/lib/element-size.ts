import {
  afterNextRender,
  DestroyRef,
  ElementRef,
  Injector,
  signal,
} from '@angular/core';

export function elementSize({
  elementRef,
  injector,
}: {
  elementRef: ElementRef<HTMLElement>;
  injector: Injector;
}) {
  const destroyRef = injector.get(DestroyRef);
  const result = signal({
    width: 0,
    height: 0,
  });

  afterNextRender(
    () => {
      result.set({
        width: elementRef.nativeElement.offsetWidth,
        height: elementRef.nativeElement.offsetHeight,
      });

      const resizeObserver = new ResizeObserver((entries) => {
        // Since we only observe the one element, we don't need to loop over the
        // array
        const entry = entries[0];
        let width: number;
        let height: number;

        if ('borderBoxSize' in entry) {
          const borderSizeEntry = entry['borderBoxSize'];
          // iron out differences between browsers
          const borderSize = Array.isArray(borderSizeEntry)
            ? borderSizeEntry[0]
            : borderSizeEntry;

          width = borderSize['inlineSize'];
          height = borderSize['blockSize'];
        } else {
          // for browsers that don't support `borderBoxSize`
          // we calculate it ourselves to get the correct border box.
          width = elementRef.nativeElement.offsetWidth;
          height = elementRef.nativeElement.offsetHeight;
        }

        result.set({ width, height });
      });

      destroyRef.onDestroy(() => resizeObserver.disconnect());
    },
    { injector },
  );

  return result.asReadonly();
}

import { afterNextRender, signal } from "@angular/core";

/** `true` after the calling view's first render in the browser; bind it to a `data-ready` marker. */
export function renderedFlag() {
  const ready = signal(false);

  afterNextRender(() => ready.set(true));

  return ready.asReadonly();
}

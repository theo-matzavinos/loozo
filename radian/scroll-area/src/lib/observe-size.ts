export function observeSize(element: HTMLElement, handler: () => void) {
  let rAF = 0;

  /**
   * Resize Observer will throw an often benign error that says `ResizeObserver loop
   * completed with undelivered notifications`. This means that ResizeObserver was not
   * able to deliver all observations within a single animation frame, so we use
   * `requestAnimationFrame` to ensure we don't deliver unnecessary observations.
   * Further reading: https://github.com/WICG/resize-observer/issues/38
   */
  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(rAF);

    rAF = window.requestAnimationFrame(handler);
  });

  resizeObserver.observe(element);

  return () => {
    window.cancelAnimationFrame(rAF);
    resizeObserver.unobserve(element);
  };
}

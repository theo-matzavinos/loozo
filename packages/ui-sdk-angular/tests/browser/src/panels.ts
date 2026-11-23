import { ChangeDetectorRef, EnvironmentInjector, afterNextRender, inject } from "@angular/core";

/** What a fixture reports to the suite's panel log (tests/browser/observer.ts). */
export type PanelOutput = {
  name: string;
  label: string;
  value?: unknown;
  reason?: string;
  canceled?: boolean;
  previous?: unknown;
  /** The element it's about; the log records its serial. */
  element?: Element | null;
};

/** A `<key>ChangeRequest` event, as far as the fixtures read it. */
export type Request = {
  value: unknown;
  details: { reason: string; canceled: boolean; cancel(): void };
};

/** Reports an output or a fixture step to the panel log; nothing on the server. */
export function report(output: PanelOutput): void {
  if (typeof document === "undefined") {
    return;
  }

  document.dispatchEvent(new CustomEvent("ui-sdk-panel-output", { detail: output }));
}

/** Reports a request, after canceling it when `veto` is set. */
export function reportRequest(label: string, name: string, event: Request, veto: boolean): void {
  if (veto) {
    event.details.cancel();
  }

  report({
    name,
    label,
    value: event.value,
    reason: event.details.reason,
    canceled: event.details.canceled,
  });
}

/** A 200 ms opacity transition on every probed panel, so exits and enters really animate. */
export const panelStyles = `
  [data-probe-panel] { opacity: 1; transition: opacity 200ms linear; }
  [data-probe-panel][data-starting-style], [data-probe-panel][data-ending-style] { opacity: 0; }
`;

/**
 * Sets `set(true)` now and `set(false)` in the next render's write phase, before the panel this
 * mounts binds: the mount is invalidated before its bind (P7). The callback registers on the
 * application's injector: registered on the view's, view traversal would attach the slot's bind
 * first, and the panel would bind before it's invalidated.
 */
export function invalidateBeforeBind(): (label: string, set: (value: boolean) => void) => void {
  const injector = inject(EnvironmentInjector);
  const changes = inject(ChangeDetectorRef);

  return (label, set) => {
    afterNextRender(
      {
        write: () => {
          const panel = document.querySelector(`[data-probe="${label}"]`);

          report({ name: "invalidate-start", label, element: panel });
          set(false);
          changes.detectChanges();
          report({ name: "invalidate-end", label });
        },
      },
      { injector },
    );
    set(true);
  };
}

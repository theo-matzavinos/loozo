import { isPlatformBrowser } from "@angular/common";
import {
  Directive,
  ElementRef,
  HostAttributeToken,
  type OnInit,
  PLATFORM_ID,
  afterNextRender,
  inject,
} from "@angular/core";

/**
 * The observer the browser suite installs before main.js runs (tests/browser/observer.ts).
 * Fixture code reports to it; the package itself reports nothing.
 */
type Probe = {
  start(instance: string): void;
  ready(instance: string): void;
  reach(instance: string, type: string): void;
  early(instance: string, event: KeyboardEvent): void;
  dispatched(instance: string, event: KeyboardEvent): void;
};

declare global {
  var __uiSdkProbe: Probe | undefined;
}

/** Stamps the start of an instance's hydration window: call it from the fixture component that creates the root. */
export function startWindow(...instances: string[]): void {
  for (const instance of instances) {
    globalThis.__uiSdkProbe?.start(instance);
  }
}

/** Stamps a root's `ngOnInit`, the moment its inputs are set. Fixture-only; on the root element. */
@Directive({ selector: "[appReadyProbe]" })
export class AppReadyProbe implements OnInit {
  readonly #instance = inject(new HostAttributeToken("appReadyProbe"));

  ngOnInit(): void {
    globalThis.__uiSdkProbe?.ready(this.#instance);
  }
}

/**
 * Fixture-only, on a Select trigger, listed before the package's directives so its listeners run
 * first: stamps every event of the trigger's types as it reaches the element (live or replayed),
 * which ends the instance's window before core handles it. With `?early=1` it dispatches a
 * non-bubbling ArrowDown keydown in a microtask after the creation pass, before the update pass
 * and the first bind. With `?control=1` it writes the falsifier's positive controls.
 */
@Directive({
  selector: "[appTriggerProbe]",
  host: {
    "(keydown)": 'reach("keydown")',
    "(pointerdown)": 'reach("pointerdown")',
    "(pointerenter)": 'reach("pointerenter")',
    "(focusin)": 'reach("focusin")',
    "(click)": 'reach("click")',
  },
})
export class AppTriggerProbe {
  readonly #instance = inject(new HostAttributeToken("appTriggerProbe"));
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    const search = new URLSearchParams(location.search);

    if (search.has("early")) {
      queueMicrotask(() => {
        const event = new KeyboardEvent("keydown", {
          key: "ArrowDown",
          code: "ArrowDown",
          bubbles: false,
          cancelable: true,
        });

        globalThis.__uiSdkProbe?.early(this.#instance, event);
        this.#element.dispatchEvent(event);
        globalThis.__uiSdkProbe?.dispatched(this.#instance, event);
      });
    }

    if (search.has("control")) {
      afterNextRender(() => {
        this.#element.setAttribute("aria-haspopup", "menu");
        this.#element.setAttribute("aria-haspopup", "listbox");
        this.#element.setAttribute("aria-controls", "control-wrong-content");
        this.#element.removeAttribute("aria-controls");
      });
    }
  }

  protected reach(type: string): void {
    globalThis.__uiSdkProbe?.reach(this.#instance, type);
  }
}

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
import { UiRadioGroup } from "@loozo/ui-sdk-angular/radio";
import { UiSelect } from "@loozo/ui-sdk-angular/select";

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
  earlyFocus(instance: string, details: EarlyFocusDetails): void;
};

/** What AppEarlyFocus saw in the creation/update gap. */
export type EarlyFocusDetails = {
  focusUnchanged: boolean;
  focusouts: number;
  /** What the root's `focus()` threw, if anything. */
  thrown: string | null;
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

/**
 * Fixture-only, on a RadioGroup or Select root, with `?earlyFocus=1`: in a microtask after the
 * block's creation pass, before its update pass sets any input, calls the root's `focus()` and
 * records whether focus moved. With `appEarlyFocusSequence`, a space-separated list of test ids,
 * it then focuses each in turn, counting the `focusout`s the package's listeners receive. It
 * reads no Angular input: none is set yet.
 */
@Directive({ selector: "[appEarlyFocus]" })
export class AppEarlyFocus {
  readonly #instance = inject(new HostAttributeToken("appEarlyFocus"));
  readonly #sequence = inject(new HostAttributeToken("appEarlyFocusSequence"), { optional: true });
  readonly #root =
    inject(UiRadioGroup, { self: true, optional: true }) ??
    inject(UiSelect, { self: true, optional: true });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    if (!new URLSearchParams(location.search).has("earlyFocus")) {
      return;
    }

    queueMicrotask(() => this.#run());
  }

  #run(): void {
    const before = document.activeElement;
    let thrown: string | null = null;

    try {
      this.#root!.focus();
    } catch (error) {
      thrown = String(error);
    }

    const focusUnchanged = document.activeElement === before;
    let focusouts = 0;
    const count = () => {
      focusouts += 1;
    };

    document.addEventListener("focusout", count, { capture: true });

    for (const testId of this.#sequence?.split(" ") ?? []) {
      document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.focus();
    }

    document.removeEventListener("focusout", count, { capture: true });
    globalThis.__uiSdkProbe?.earlyFocus(this.#instance, { focusUnchanged, focusouts, thrown });
  }
}

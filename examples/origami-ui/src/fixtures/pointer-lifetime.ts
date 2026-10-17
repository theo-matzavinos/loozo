import {
  Component,
  DOCUMENT,
  DestroyRef,
  Directive,
  Service,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import type { ApplicationRef, ComponentRef } from "@angular/core";
import { createApplication } from "@angular/platform-browser";
import {
  OrigamiPopover,
  OrigamiPopoverOptions,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";

type PointerMode = "plain" | "target-drag" | "window-drag" | "destroy-up" | "veto-up";

@Service({ autoProvided: false })
class LatePointerPolicy {
  readonly dismissible = signal(true);
}

/** Replaces only root dismissal; open/disabled stay the composed root's own model and input. */
@Directive({
  selector: "[latePointerPolicy]",
  hostDirectives: [{ directive: OrigamiPopover, inputs: ["open"], outputs: ["openChange"] }],
  providers: [
    LatePointerPolicy,
    OrigamiPopoverOptions.provideFactory(() => {
      const root = inject(OrigamiPopover);
      const policy = inject(LatePointerPolicy);

      return { open: root.open, disabled: root.disabled, dismissible: policy.dismissible };
    }),
  ],
})
export class LatePointerRootPolicy {
  readonly dismissible = inject(LatePointerPolicy).dismissible;
}

/** Bootstrapped as its own Angular application so destroying it is an application lifetime. */
@Component({
  selector: "acceptance-late-pointer-owner",
  imports: [
    LatePointerRootPolicy,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
  ],
  template: `
    <div latePointerPolicy [(open)]="open" (openChange)="output($event)">
      <button ogPopoverTrigger ogPopoverAnchor data-testid="late-pointer-trigger">
        Scope Trigger
      </button>
      <section ogPopoverContent side="inline-start" [gap]="8" data-testid="late-pointer-content">
        <button type="button" data-testid="late-pointer-live" (click)="live.update(increment)">
          Live {{ live() }}
        </button>
      </section>
      <output data-testid="late-pointer-intent">{{ open() }}</output>
      <output data-testid="late-pointer-outputs">{{ json() }}</output>
    </div>
  `,
  styles: `
    section {
      inline-size: 150px;
      padding: 12px;
      background: #222;
      color: #eee;
    }
  `,
})
export class LatePointerOwner {
  readonly open = signal(true);
  readonly policy = viewChild.required(LatePointerRootPolicy);
  readonly outputs = signal<boolean[]>([]);
  readonly json = computed(() => JSON.stringify(this.outputs()));
  readonly live = signal(0);
  readonly increment = (value: number): number => value + 1;

  output(value: boolean): void {
    this.outputs.update((values) => [...values, value]);
  }
}

/**
 * Passive document-capture and window-bubble journals around genuine driver input. The
 * window-bubble consumer runs after every earlier listener: it prevents a native drag, vetoes
 * dismissal, or destroys the owning application at the end of the pointer dispatch.
 */
@Component({
  selector: "acceptance-late-pointer",
  template: `
    <h2>Late native pointer lifetime</h2>
    <button
      type="button"
      data-testid="late-pointer-mount-target-drag"
      (click)="mount('target-drag')"
    >
      Target prevents drag
    </button>
    <button
      type="button"
      data-testid="late-pointer-mount-window-drag"
      (click)="mount('window-drag')"
    >
      Window prevents drag
    </button>
    <button type="button" data-testid="late-pointer-mount-destroy-up" (click)="mount('destroy-up')">
      Destroy app during UP
    </button>
    <button type="button" data-testid="late-pointer-mount-veto-up" (click)="mount('veto-up')">
      Policy change during UP
    </button>
    <output data-testid="late-pointer-ready">{{ ready() }}</output>
    <div data-testid="late-pointer-host" class="host"></div>
    <div class="row">
      <div draggable="true" data-testid="late-pointer-drag-source" (dragstart)="start($event)">
        Drag source
      </div>
      <div
        data-testid="late-pointer-drop-target"
        (dragover)="$event.preventDefault()"
        (drop)="drop($event)"
      >
        Drop target
      </div>
    </div>
    <button type="button" data-testid="late-pointer-outside">Outside control</button>
    <output data-testid="late-pointer-journal">{{ json() }}</output>
  `,
  styles: `
    :host {
      position: fixed;
      inset-inline-end: 20px;
      inset-block-start: 12px;
      z-index: 5;
      inline-size: 450px;
      padding: 12px;
      color-scheme: dark;
      background: #151515;
      color: #eee;
      font: 14px system-ui;
    }
    .host {
      padding-inline-start: 200px;
    }
    .row {
      display: flex;
      gap: 24px;
      margin: 24px 0;
    }
    .row > div {
      padding: 20px;
      border: 1px solid #888;
      inline-size: 130px;
    }
    output {
      display: block;
      max-block-size: 100px;
      overflow: auto;
      font-size: 10px;
    }
  `,
})
export class LatePointer {
  readonly ready = signal(false);
  readonly entries = signal<object[]>([]);
  readonly json = computed(() => JSON.stringify(this.entries()));
  readonly #document = inject(DOCUMENT);
  #application: ApplicationRef | null = null;
  #owner: ComponentRef<LatePointerOwner> | null = null;
  #mode: PointerMode = "plain";

  constructor() {
    const window = this.#document.defaultView;

    if (window === null) {
      return;
    }

    const observe = (event: Event) => {
      if (!this.#journaled(event)) {
        return;
      }

      this.record("document", event);
    };
    const later = (event: Event) => {
      if (!this.#journaled(event) || !(event.target instanceof HTMLElement)) {
        return;
      }

      this.record("window-before", event);

      if (event.type === "dragstart" && this.#mode === "window-drag") {
        event.preventDefault();
      }

      if (event.type === "pointerup" && event.target.dataset["testid"] === "late-pointer-outside") {
        if (this.#mode === "veto-up") {
          this.#owner?.instance.policy().dismissible.set(false);
        } else if (this.#mode === "destroy-up") {
          const old = this.#owner;

          this.#application?.destroy();
          this.#application = null;
          this.#owner = null;
          this.entries.update((entries) => [
            ...entries,
            {
              stage: "app-destroyed",
              open: old?.instance.open(),
              outputs: old?.instance.outputs(),
            },
          ]);
          // Reread the destroyed owner after its queued pointer decision would have run.
          setTimeout(() => {
            this.entries.update((entries) => [
              ...entries,
              {
                stage: "app-destroyed-after-task",
                open: old?.instance.open(),
                outputs: old?.instance.outputs(),
              },
            ]);
          }, 0);
          void this.mount("plain");
        }
      }

      this.record("window-after", event);
      // The next task observes the final dispatch result, including defaultPrevented/phase 0.
      setTimeout(() => this.record("after-task", event), 0);
    };
    const types = ["pointerdown", "pointerup", "pointercancel", "dragstart", "drop", "dragend"];

    for (const type of types) {
      this.#document.addEventListener(type, observe, { capture: true });
      window.addEventListener(type, later, { passive: false });
    }

    inject(DestroyRef).onDestroy(() => {
      for (const type of types) {
        this.#document.removeEventListener(type, observe, { capture: true });
        window.removeEventListener(type, later);
      }

      this.#application?.destroy();
    });
  }

  async mount(mode: PointerMode): Promise<void> {
    this.ready.set(false);
    this.#application?.destroy();
    this.#mode = mode;

    const application = await createApplication();
    const host = this.#document.querySelector('[data-testid="late-pointer-host"]');

    if (!(host instanceof HTMLElement)) {
      throw new Error("Expected the public application host");
    }

    host.replaceChildren();

    const node = this.#document.createElement("acceptance-late-pointer-owner");

    host.append(node);
    this.#application = application;
    this.#owner = application.bootstrap(LatePointerOwner, node);
    this.entries.update((entries) => [...entries, { stage: "mounted", mode }]);
    this.ready.set(true);
  }

  start(event: DragEvent): void {
    event.dataTransfer?.setData("text/plain", "late-pointer-lifetime");

    if (this.#mode === "target-drag") {
      event.preventDefault();
    }
  }

  drop(event: DragEvent): void {
    event.preventDefault();
    this.entries.update((entries) => [
      ...entries,
      { stage: "delivered-drop", trusted: event.isTrusted },
    ]);
  }

  record(stage: string, event: Event): void {
    const entry: Record<string, unknown> = {
      stage,
      type: event.type,
      trusted: event.isTrusted,
      prevented: event.defaultPrevented,
      phase: event.eventPhase,
      target: null,
      open: this.#owner?.instance.open(),
      outputs: this.#owner?.instance.outputs(),
    };

    if (event.target instanceof HTMLElement) {
      entry["target"] = event.target.dataset["testid"];
    }

    if (event instanceof PointerEvent) {
      entry["id"] = event.pointerId;
      entry["primary"] = event.isPrimary;
      entry["button"] = event.button;
    }

    this.entries.update((entries) => [...entries, entry]);
  }

  #journaled(event: Event): boolean {
    return (
      event.target instanceof HTMLElement &&
      event.target.dataset["testid"]?.startsWith("late-pointer-") === true
    );
  }
}

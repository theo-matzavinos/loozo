import {
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  EnvironmentInjector,
  Injector,
  Service,
  ViewContainerRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import type { ComponentRef } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverOptions,
  OrigamiPopoverState,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  type OrigamiPopoverSide,
  type OrigamiPopoverAlign,
} from "@loozo/origami-ui/popover";

export type NativeOwnerAction = "destroy" | "replace" | "detach" | "detach-config" | "remove-mode";

@Service({ autoProvided: false })
export class OwnerLifetimeOptions {
  readonly open = signal(false);
  readonly disabled = signal(false);
  readonly dismissible = signal(false);
  readonly id = signal("owner-lifetime-content");
  readonly side = signal<OrigamiPopoverSide>("block-end");
  readonly align = signal<OrigamiPopoverAlign>("start");
  readonly gap = signal(8);
  readonly opacity = signal("0.74 !important");
  readonly pointerEvents = signal("none !important");
}

function authoredStyles(element: HTMLElement) {
  return {
    opacity: element.style.getPropertyValue("opacity"),
    opacityPriority: element.style.getPropertyPriority("opacity"),
    pointer: element.style.getPropertyValue("pointer-events"),
    pointerPriority: element.style.getPropertyPriority("pointer-events"),
  };
}

@Service({ autoProvided: false })
export class OwnerLifetimeJournal {
  readonly entries = signal<object[]>([]);
  readonly json = computed(() => JSON.stringify(this.entries()));

  record(entry: object): void {
    this.entries.update((entries) => [...entries, entry]);
  }
}

@Directive({
  selector: "[ownerLifetimeContent]",
  exportAs: "ownerLifetimeContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideFactory(() => inject(OwnerLifetimeOptions))],
})
export class OwnerLifetimeContent {
  readonly state = inject(OrigamiPopoverContentState);
}

/** A genuine ComponentRef-owned Popover; destroyed or replaced from its native opening callback. */
@Component({
  selector: "acceptance-native-lifetime-owner",
  imports: [OrigamiPopoverTrigger, OrigamiPopoverAnchor, OwnerLifetimeContent],
  hostDirectives: [OrigamiPopover],
  providers: [
    OwnerLifetimeOptions,
    OrigamiPopoverOptions.provideFactory(() => inject(OwnerLifetimeOptions)),
  ],
  template: `
    <button
      ogPopoverTrigger
      ogPopoverAnchor
      data-testid="owner-lifetime-trigger"
      (focus)="triggerFocused()"
    >
      Live owner Trigger
    </button>
    <section
      ownerLifetimeContent
      #content="ownerLifetimeContent"
      data-testid="owner-lifetime-content"
      role="group"
      aria-label="Native owner lifetime"
      style="--consumer-visual: preserved"
      [style.opacity]="options.opacity()"
      [style.pointer-events]="options.pointerEvents()"
      (beforetoggle)="native($event)"
    >
      @if (content.state.open()) {
        <input autofocus data-testid="owner-lifetime-autofocus" aria-label="Owner autofocus" />
        <button type="button" data-testid="owner-lifetime-live" (click)="live.update(increment)">
          Live {{ live() }}
        </button>
        <button type="button" data-testid="owner-lifetime-close" (click)="options.open.set(false)">
          Close from Options
        </button>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      color-scheme: dark;
    }
    section {
      inline-size: 260px;
      padding: 12px;
      background: #242424;
      color: #eee;
      border: 1px solid #888;
    }
    section:popover-open {
      display: grid;
      gap: 8px;
    }
  `,
})
export class NativeLifetimeOwner {
  readonly generation = input.required<number>();
  readonly options = inject(OwnerLifetimeOptions);
  readonly state = inject(OrigamiPopoverState);
  readonly content = viewChild.required(OwnerLifetimeContent);
  readonly journal = inject(OwnerLifetimeJournal);
  readonly live = signal(0);
  readonly increment = (value: number): number => value + 1;
  onOpening: ((element: HTMLElement) => void) | null = null;
  onTriggerFocus: (() => void) | null = null;
  destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.journal.record({ stage: "destroy-ref", generation: this.generation() });
    });
  }

  native(event: Event): void {
    if (!(event instanceof ToggleEvent) || !(event.currentTarget instanceof HTMLElement)) {
      throw new Error("Expected a genuine native beforetoggle on authored Content");
    }

    const element = event.currentTarget;

    this.journal.record({
      stage: "beforetoggle",
      generation: this.generation(),
      newState: event.newState,
      trusted: event.isTrusted,
      connected: element.isConnected,
      native: element.matches(":popover-open"),
      intent: this.state.open(),
      retained: this.content().state.open(),
    });

    if (event.newState === "open") {
      const action = this.onOpening;

      this.onOpening = null;
      action?.(element);
    }
  }

  triggerFocused(): void {
    const action = this.onTriggerFocus;

    this.onTriggerFocus = null;
    action?.();
  }
}

/** Client-mounted on demand; the owner itself is created only by an explicit action. */
@Component({
  selector: "acceptance-native-owner-lifetime",
  providers: [OwnerLifetimeJournal],
  template: `
    <h2>Native opening owner lifetime</h2>
    <button type="button" data-testid="owner-lifetime-mount" (click)="mount()">
      Mount fresh owner
    </button>
    <button type="button" data-testid="owner-lifetime-arm-destroy" (click)="arm('destroy')">
      Destroy in opening callback
    </button>
    <button type="button" data-testid="owner-lifetime-arm-replace" (click)="arm('replace')">
      Replace in opening callback
    </button>
    <button type="button" data-testid="owner-lifetime-arm-detach" (click)="arm('detach')">
      Unsupported same-owner detach
    </button>
    <button
      type="button"
      data-testid="owner-lifetime-arm-detach-config"
      (click)="arm('detach-config')"
    >
      Unsupported detach plus configuration change
    </button>
    <button type="button" data-testid="owner-lifetime-arm-remove-mode" (click)="arm('remove-mode')">
      Unsupported native mode removal
    </button>
    <button type="button" data-testid="owner-lifetime-arm-restore-destroy" (click)="armRestore()">
      Destroy in restored Trigger focus
    </button>
    <output data-testid="owner-lifetime-settled">{{ settled() }}</output>
    <output data-testid="owner-lifetime-journal">{{ journal.json() }}</output>
    <ng-template #slot />
  `,
  styles: `
    :host {
      display: block;
      margin-block: 16px;
    }
    output {
      display: block;
      font-size: 10px;
    }
  `,
})
export class NativeOwnerLifetime {
  readonly journal = inject(OwnerLifetimeJournal);
  readonly settled = signal(0);
  readonly slot = viewChild.required("slot", { read: ViewContainerRef });
  readonly #environment = inject(EnvironmentInjector);
  readonly #injector = inject(Injector);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  #current: ComponentRef<NativeLifetimeOwner> | null = null;
  #generation = 0;

  mount(): void {
    this.#current?.destroy();

    const reference = this.slot().createComponent(NativeLifetimeOwner, {
      environmentInjector: this.#environment,
    });

    this.#generation += 1;
    reference.setInput("generation", this.#generation);

    if (this.#generation > 1) {
      // Distinct ordinary authored styles expose accidental cleanup into the new owner.
      reference.instance.options.opacity.set("0.42");
      reference.instance.options.pointerEvents.set("auto");
    }

    this.#current = reference;
    this.journal.record({ stage: "mounted", generation: this.#generation });
  }

  /** Script close restores focus to the Trigger, whose listener synchronously destroys the owner. */
  armRestore(): void {
    const reference = this.#current;

    if (reference === null) {
      throw new Error("Mount the public ComponentRef consumer first");
    }

    const owner = reference.instance;
    const rootState = owner.state;
    const contentState = owner.content().state;
    const generation = owner.generation();

    owner.onTriggerFocus = () => {
      reference.destroy();
      this.#current = null;
      // A DOM marker orders every teardown mutation before it and any stale work after it.
      this.#host.setAttribute("data-owner-destroyed", String(generation));
      this.journal.record({
        stage: "after-restore-destroy",
        generation,
        destroyed: owner.destroyed,
        viewDestroyed: reference.hostView.destroyed,
        intent: rootState.open(),
        retained: contentState.open(),
      });
      afterNextRender(
        () => {
          this.journal.record({ stage: "after-render", generation });
          this.settled.update((value) => value + 1);
        },
        { injector: this.#injector },
      );
    };
  }

  arm(action: NativeOwnerAction): void {
    const reference = this.#current;

    if (reference === null) {
      throw new Error("Mount the public ComponentRef consumer first");
    }

    reference.instance.onOpening = (element) => {
      const owner = reference.instance;
      const rootState = owner.state;
      const contentState = owner.content().state;
      const generation = owner.generation();

      if (action === "destroy" || action === "replace") {
        reference.destroy();
        this.#current = null;

        if (action === "replace") {
          this.mount();
        }
      } else if (action === "remove-mode") {
        // Deliberately unsupported: registration and owner stay live.
        element.removeAttribute("popover");
      } else {
        // Detaching alone is not a library registration teardown.
        if (action === "detach-config") {
          owner.options.gap.set(12);
        }

        element.remove();
      }

      this.journal.record({
        stage: "after-action",
        action,
        generation,
        destroyed: owner.destroyed,
        viewDestroyed: reference.hostView.destroyed,
        connected: element.isConnected,
        native: element.matches(":popover-open"),
        intent: rootState.open(),
        retained: contentState.open(),
        styles: authoredStyles(element),
      });
      afterNextRender(
        () => {
          this.journal.record({
            stage: "after-render",
            action,
            generation,
            destroyed: owner.destroyed,
            connected: element.isConnected,
            native: element.matches(":popover-open"),
            intent: rootState.open(),
            retained: contentState.open(),
            inert: element.inert,
            styles: authoredStyles(element),
          });
          this.settled.update((value) => value + 1);
        },
        { injector: this.#injector },
      );
    };
  }
}

import {
  Component,
  Directive,
  ElementRef,
  Injector,
  PLATFORM_ID,
  Service,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { isPlatformServer } from "@angular/common";
import {
  OrigamiToast,
  OrigamiToastClose,
  OrigamiToastRegion,
  OrigamiToastRegionOptions,
  OrigamiToastRegionState,
  OrigamiToaster,
  type OrigamiToastAddOptions,
  type OrigamiToastRecord,
} from "@loozo/origami-ui/toast";

/** Cashier-shaped toast data; `motion` gives a 250 ms entrance and a 1500 ms exit. */
export interface ReplaceToast {
  title: string;
  description?: string;
  kind?: "success" | "info" | "warning" | "error";
  reload?: boolean;
  motion?: boolean;
}

@Service()
export class ReplaceToasts extends OrigamiToaster<ReplaceToast> {}

/** The region's duration and limit, which the tests set and restore. */
@Service()
export class ReplaceRegionConfig {
  readonly duration = signal(60000);
  readonly limit = signal(3);
}

/** A consumer region composing the Origami region, its factory Options over the config. */
@Directive({
  selector: "[replaceRegion]",
  exportAs: "replaceRegion",
  hostDirectives: [{ directive: OrigamiToastRegion, inputs: ["ogToastRegion: replaceRegion"] }],
  providers: [
    OrigamiToastRegionOptions.provideFactory(() => {
      const config = inject(ReplaceRegionConfig);

      return {
        toaster: signal(inject(ReplaceToasts)),
        duration: config.duration,
        limit: config.limit,
      };
    }),
  ],
})
export class ReplaceRegion {
  readonly state = inject<OrigamiToastRegionState<ReplaceToast>>(OrigamiToastRegionState);
}

/**
 * Replacing toasts by a caller id. In the browser, `window.toastReplace` is the fixture: the tests
 * call `add` and the controls below from script, which moves neither focus nor the pointer.
 */
@Component({
  selector: "acceptance-toast-replace-fixture",
  imports: [ReplaceRegion, OrigamiToast, OrigamiToastClose],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach toast behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <span data-testid="server-add" [attr.data-id]="serverAdd"></span>
    <button type="button" data-testid="outside">Outside</button>
    <dialog #dialog data-testid="replace-dialog">
      <button type="button" data-testid="dialog-inside">Inside the dialog</button>
    </dialog>

    @if (mounted()) {
      <section
        [replaceRegion]="toasts"
        #region="replaceRegion"
        aria-label="Notifications"
        data-testid="region"
      >
        <ol data-testid="region-list">
          @for (toast of region.state.toasts(); track toast.id) {
            <li
              [ogToast]="toast"
              #item="ogToast"
              [attr.data-testid]="'toast-' + toast.id"
              [attr.data-kind]="toast.data.kind ?? null"
              [attr.data-motion]="toast.data.motion ? '' : null"
              [attr.data-open]="item.state.open()"
            >
              <strong>{{ toast.data.title }}</strong>
              <p>{{ toast.data.description }}</p>
              @if (toast.data.reload) {
                <button type="button" [attr.data-testid]="'reload-' + toast.id">Reload</button>
              }
              <button ogToastClose [attr.data-testid]="'close-' + toast.id" aria-label="Close">
                ×
              </button>
            </li>
          }
        </ol>
      </section>
    }
  `,
  styles: `
    [data-motion][data-entering] {
      animation: replace-enter 250ms linear;
    }

    [data-motion][data-leaving] {
      animation: replace-exit 1500ms linear forwards;
    }

    @keyframes replace-enter {
      from {
        opacity: 0.2;
      }
    }

    @keyframes replace-exit {
      to {
        opacity: 0;
      }
    }
  `,
})
export class ToastReplaceFixture {
  readonly toasts = inject(ReplaceToasts);
  readonly config = inject(ReplaceRegionConfig);
  readonly attached = signal(false);
  readonly mounted = signal(true);
  /** The id `add` returned on the server, where it keeps nothing; absent in the browser. */
  readonly serverAdd: string | null = null;
  /**
   * What `replaceKeepArm`'s after-render write saw: `same-reload` when the focused Reload was
   * still the focused, connected element, else `other`.
   */
  armedSaw: string | null = null;

  readonly #injector = inject(Injector);
  private readonly region = viewChild(ReplaceRegion);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog");

  constructor() {
    if (isPlatformServer(inject(PLATFORM_ID))) {
      this.serverAdd = this.toasts.add({ title: "Server" }, { id: "server-id" });

      return;
    }

    afterNextRender(() => {
      (window as unknown as { toastReplace: ToastReplaceFixture }).toastReplace = this;
    });
  }

  add(data: ReplaceToast, options?: OrigamiToastAddOptions): string {
    return this.toasts.add(data, options);
  }

  /** Adds, returning the thrown error as `name: message` instead of throwing it. */
  attempt(data: ReplaceToast, options?: OrigamiToastAddOptions): string {
    try {
      return `ok: ${this.toasts.add(data, options)}`;
    } catch (error) {
      if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
      }

      throw error;
    }
  }

  close(id: string): void {
    this.toasts.close(id);
  }

  /** The region's State `toasts()`, or none while it's unmounted. */
  records(): readonly OrigamiToastRecord<ReplaceToast>[] {
    return this.region()?.state.toasts() ?? [];
  }

  /** Closes every toast the region shows, so a block starts from an empty list. */
  clear(): void {
    for (const record of this.records()) {
      this.toasts.close(record.id);
    }
  }

  /** The same id twice in one handler. */
  twice(): void {
    this.toasts.add({ title: "Twice first" }, { id: "twice", duration: 5000 });
    this.toasts.add({ title: "Twice second" }, { id: "twice", duration: 800 });
  }

  openDialog(): void {
    this.dialog().nativeElement.showModal();
  }

  closeDialog(): void {
    this.dialog().nativeElement.close();
  }

  /**
   * Closes the dialog and replaces the held `held2` in one handler: whether the region shows it
   * right after, `present` or `absent`.
   */
  closeAndReplace(): string {
    this.dialog().nativeElement.close();
    this.toasts.add({ title: "Held2 new" }, { id: "held2", duration: 900 });

    for (const record of this.records()) {
      if (record.id === "held2") {
        return "present";
      }
    }

    return "absent";
  }

  /**
   * Replaces `id` keeping its Reload, then, in the after-render write that follows that
   * replacement's render, replaces it again without Reload and with 650 ms.
   */
  replaceKeepArm(id: string): void {
    const focused = document.activeElement;

    this.toasts.add({ title: "Kept", reload: true }, { id, duration: Infinity });
    afterNextRender(
      {
        write: () => {
          const same =
            focused !== null && focused.isConnected && document.activeElement === focused;

          this.armedSaw = "other";

          if (same) {
            this.armedSaw = "same-reload";
          }

          this.toasts.add({ title: "Removed" }, { id, duration: 650 });
        },
      },
      { injector: this.#injector },
    );
  }
}

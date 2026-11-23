import {
  Component,
  EnvironmentInjector,
  Service,
  ViewContainerRef,
  inject,
  input,
  viewChild,
} from "@angular/core";
import type { ComponentRef } from "@angular/core";
import {
  OrigamiToast,
  OrigamiToastClose,
  OrigamiToastRegion,
  OrigamiToaster,
  type OrigamiToastRecord,
} from "@loozo/origami-ui/toast";

export interface LifetimeToast {
  title: string;
}

/** The toaster whose regions a ComponentRef creates and destroys. */
@Service()
export class LifetimeToasts extends OrigamiToaster<LifetimeToast> {}

/** A genuine ComponentRef-owned region; its host's focus listener can destroy it. */
@Component({
  selector: "acceptance-toast-lifetime-region",
  imports: [OrigamiToastRegion, OrigamiToast, OrigamiToastClose],
  template: `
    <section
      [ogToastRegion]="toasts"
      #region="ogToastRegion"
      [duration]="1000"
      [limit]="limit()"
      aria-label="Lifetime notifications"
      data-testid="lifetime-region"
      [attr.data-generation]="generation()"
      (focus)="hostFocused()"
    >
      <output data-testid="lifetime-region-state">{{ titles(region.state.toasts()) }}</output>
      <ol>
        @for (toast of region.state.toasts(); track toast.id) {
          <li
            [ogToast]="toast"
            #item="ogToast"
            [attr.data-testid]="'lifetime-toast-' + generation() + '-' + toast.data.title"
            [attr.data-open]="item.state.open()"
          >
            {{ toast.data.title }}
            <button
              ogToastClose
              [attr.data-testid]="'lifetime-close-' + toast.data.title"
              aria-label="Close"
            >
              ×
            </button>
          </li>
        }
      </ol>
    </section>
  `,
})
export class ToastLifetimeRegion {
  readonly generation = input.required<number>();
  readonly limit = input(3);
  readonly toasts = inject(LifetimeToasts);
  onHostFocus: (() => void) | null = null;

  hostFocused(): void {
    const action = this.onHostFocus;

    this.onHostFocus = null;
    action?.();
  }

  titles(records: readonly OrigamiToastRecord<LifetimeToast>[]): string {
    const titles: string[] = [];

    for (const record of records) {
      titles.push(record.data.title);
    }

    return titles.join(" ");
  }
}

/**
 * Mounts lifetime regions on demand and arms a focus listener, on the return target or on the
 * region host, that destroys the region synchronously inside its close's focus move, and with
 * a replacement mounts a new region on the same toaster that registers at once. A plain modal
 * `<dialog>` holds the toasts added from inside it; `held-b` is one a control outside replaces, or
 * closes and adds again under that dialog.
 */
@Component({
  selector: "acceptance-toast-lifetime",
  template: `
    <h2>Region lifetime</h2>
    <button type="button" data-testid="lifetime-mount" (click)="mount()">
      Mount a lifetime region
    </button>
    <button type="button" data-testid="lifetime-mount-limited" (click)="mount(1)">
      Mount a lifetime region with a limit of 1
    </button>
    <button type="button" data-testid="lifetime-add" (click)="add()">
      Add to the lifetime toaster
    </button>
    <button type="button" data-testid="lifetime-return" (focus)="returnFocused()">
      Lifetime return target
    </button>
    <button type="button" data-testid="lifetime-arm-return-destroy" (click)="arm('return', false)">
      Destroy in the return target's focus
    </button>
    <button type="button" data-testid="lifetime-arm-return-replace" (click)="arm('return', true)">
      Replace in the return target's focus
    </button>
    <button type="button" data-testid="lifetime-arm-host-destroy" (click)="arm('host', false)">
      Destroy in the region host's focus
    </button>
    <button type="button" data-testid="lifetime-arm-host-replace" (click)="arm('host', true)">
      Replace in the region host's focus
    </button>
    <button type="button" data-testid="lifetime-replace-held" (click)="replaceHeld()">
      Replace held-b with Lb2, 1600 ms
    </button>
    <button type="button" data-testid="lifetime-requeue-held" (click)="requeueHeld(dialog)">
      Under the modal dialog, close held-b and add it again as Lb2, 1600 ms
    </button>
    <button type="button" data-testid="lifetime-dialog-open" (click)="dialog.showModal()">
      Open a modal dialog
    </button>
    <dialog #dialog data-testid="lifetime-dialog">
      <button type="button" data-testid="lifetime-dialog-add" (click)="add()">
        Add to the lifetime toaster
      </button>
      <button type="button" data-testid="lifetime-dialog-add-held" (click)="addHeld()">
        Add Lb with id held-b, 250 ms
      </button>
      <button type="button" data-testid="lifetime-dialog-close" (click)="dialog.close()">
        Close
      </button>
    </dialog>
    <ng-template #slot />
  `,
})
export class ToastLifetime {
  readonly slot = viewChild.required("slot", { read: ViewContainerRef });
  readonly #environment = inject(EnvironmentInjector);
  readonly #toasts = inject(LifetimeToasts);
  #current: ComponentRef<ToastLifetimeRegion> | null = null;
  #generation = 0;
  #count = 0;
  #onReturnFocus: (() => void) | null = null;

  mount(limit = 3): ComponentRef<ToastLifetimeRegion> {
    this.#current?.destroy();

    const reference = this.slot().createComponent(ToastLifetimeRegion, {
      environmentInjector: this.#environment,
    });

    this.#generation += 1;
    reference.setInput("generation", this.#generation);
    reference.setInput("limit", limit);
    this.#current = reference;

    return reference;
  }

  add(): void {
    this.#count += 1;
    this.#toasts.add({ title: `L${this.#count}` });
  }

  addHeld(): void {
    this.#toasts.add({ title: "Lb" }, { id: "held-b", duration: 250 });
  }

  replaceHeld(): void {
    this.#toasts.add({ title: "Lb2" }, { id: "held-b", duration: 1600 });
  }

  /** Holds the toasts with the dialog while it closes `held-b` and adds it again as the newest. */
  requeueHeld(dialog: HTMLDialogElement): void {
    dialog.showModal();
    this.#toasts.close("held-b");
    this.replaceHeld();
    dialog.close();
  }

  arm(target: "return" | "host", replace: boolean): void {
    const reference = this.#current;

    if (reference === null) {
      throw new Error("Mount a lifetime region first");
    }

    const action = (): void => {
      reference.destroy();
      this.#current = null;

      if (replace) {
        // Registered now, inside the old region's close.
        this.mount().changeDetectorRef.detectChanges();
      }
    };

    if (target === "return") {
      this.#onReturnFocus = action;
    } else {
      reference.instance.onHostFocus = action;
    }
  }

  returnFocused(): void {
    const action = this.#onReturnFocus;

    this.#onReturnFocus = null;
    action?.();
  }
}
